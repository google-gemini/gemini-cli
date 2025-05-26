/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Part,
  PartListUnion,
  GenerateContentResponse,
  FunctionCall,
  FunctionDeclaration,
} from '@google/genai';
import {
  ToolCallConfirmationDetails,
  ToolResult,
  ToolResultDisplay,
} from '../tools/tools.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { reportError } from '../utils/errorReporting.js';
import { getErrorMessage } from '../utils/errors.js';
import { GeminiChat } from './geminiChat.js';

// Define a structure for tools passed to the server
export interface ServerTool {
  name: string;
  schema: FunctionDeclaration;
  // The execute method signature might differ slightly or be wrapped
  execute(
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolResult>;
  shouldConfirmExecute(
    params: Record<string, unknown>,
  ): Promise<ToolCallConfirmationDetails | false>;
}

export enum GeminiEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
  ToolCallResponse = 'tool_call_response',
  ToolCallConfirmation = 'tool_call_confirmation',
  UserCancelled = 'user_cancelled',
  Error = 'error',
}

export interface GeminiErrorEventValue {
  message: string;
}

export interface ToolCallRequestInfo {
  callId: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolCallResponseInfo {
  callId: string;
  responsePart: Part;
  resultDisplay: ToolResultDisplay | undefined;
  error: Error | undefined;
}

export interface ServerToolCallConfirmationDetails {
  request: ToolCallRequestInfo;
  details: ToolCallConfirmationDetails;
}

export type ServerGeminiContentEvent = {
  type: GeminiEventType.Content;
  value: string;
};

export type ServerGeminiToolCallRequestEvent = {
  type: GeminiEventType.ToolCallRequest;
  value: ToolCallRequestInfo;
};

export type ServerGeminiToolCallResponseEvent = {
  type: GeminiEventType.ToolCallResponse;
  value: ToolCallResponseInfo;
};

export type ServerGeminiToolCallConfirmationEvent = {
  type: GeminiEventType.ToolCallConfirmation;
  value: ServerToolCallConfirmationDetails;
};

export type ServerGeminiUserCancelledEvent = {
  type: GeminiEventType.UserCancelled;
};

export type ServerGeminiErrorEvent = {
  type: GeminiEventType.Error;
  value: GeminiErrorEventValue;
};

// The original union type, now composed of the individual types
export type ServerGeminiStreamEvent =
  | ServerGeminiContentEvent
  | ServerGeminiToolCallRequestEvent
  | ServerGeminiToolCallResponseEvent
  | ServerGeminiToolCallConfirmationEvent
  | ServerGeminiUserCancelledEvent
  | ServerGeminiErrorEvent;

// A turn manages the agentic loop turn within the server context.
export class Turn {
  readonly pendingToolCalls: Array<{
    callId: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  private debugResponses: GenerateContentResponse[];

  constructor(private readonly chat: GeminiChat) {
    this.pendingToolCalls = [];
    this.debugResponses = [];
  }
  // The run method yields simpler events suitable for server logic
  async *run(
    req: PartListUnion,
    signal?: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    try {
      const responseStream = await this.chat.sendMessageStream({
        message: req,
      });

      for await (const resp of responseStream) {
        if (signal?.aborted) {
          yield { type: GeminiEventType.UserCancelled };
          // Do not add resp to debugResponses if aborted before processing
          return;
        }
        this.debugResponses.push(resp);

        const text = getResponseText(resp);
        if (text) {
          yield { type: GeminiEventType.Content, value: text };
        }

        // Handle function calls (requesting tool execution)
        const functionCalls = resp.functionCalls ?? [];
        for (const fnCall of functionCalls) {
          const event = this.handlePendingFunctionCall(fnCall);
          if (event) {
            yield event;
          }
        }
      }
    } catch (error) {
      const contextForReport = [...this.chat.getHistory(/*curated*/ true), req];
      await reportError(
        error,
        'Error when talking to Gemini API',
        contextForReport,
        'Turn.run-sendMessageStream',
      );
      const errorMessage = getErrorMessage(error);
      yield { type: GeminiEventType.Error, value: { message: errorMessage } };
      return;
    }
  }

  private handlePendingFunctionCall(
    fnCall: FunctionCall,
  ): ServerGeminiStreamEvent | null {
    const callId =
      fnCall.id ??
      `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = fnCall.name || 'undefined_tool_name';
    const args = (fnCall.args || {}) as Record<string, unknown>;

    this.pendingToolCalls.push({ callId, name, args });

    // Yield a request for the tool call, not the pending/confirming status
    const value: ToolCallRequestInfo = { callId, name, args };
    return { type: GeminiEventType.ToolCallRequest, value };
  }

  getDebugResponses(): GenerateContentResponse[] {
    return this.debugResponses;
  }
}
