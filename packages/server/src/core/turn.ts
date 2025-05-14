/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Part,
  Chat,
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

// --- Types for Server Logic ---

// Define a simpler structure for Tool execution results within the server
interface ServerToolExecutionOutcome {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  result?: ToolResult;
  error?: Error;
  confirmationDetails: ToolCallConfirmationDetails | undefined;
}

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
  private readonly availableTools: Map<string, ServerTool>;
  private pendingToolCalls: Array<{
    callId: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  private fnResponses: Part[];
  private confirmationDetails: ToolCallConfirmationDetails[];
  private debugResponses: GenerateContentResponse[];

  constructor(
    private readonly chat: Chat,
    availableTools: ServerTool[],
  ) {
    this.availableTools = new Map(availableTools.map((t) => [t.name, t]));
    this.pendingToolCalls = [];
    this.fnResponses = [];
    this.confirmationDetails = [];
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
        this.debugResponses.push(resp);
        if (signal?.aborted) {
          yield { type: GeminiEventType.UserCancelled };
          return;
        }

        const text = getResponseText(resp);
        if (text) {
          yield { type: GeminiEventType.Content, value: text };
        }

        if (!resp.functionCalls) {
          continue;
        }

        // Handle function calls (requesting tool execution)
        for (const fnCall of resp.functionCalls) {
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

    // Execute pending tool calls
    const toolPromises = this.pendingToolCalls.map(
      async (pendingToolCall): Promise<ServerToolExecutionOutcome> => {
        const tool = this.availableTools.get(pendingToolCall.name);
        if (!tool) {
          return {
            ...pendingToolCall,
            error: new Error(
              `Tool "${pendingToolCall.name}" not found or not provided to Turn.`,
            ),
            confirmationDetails: undefined,
          };
        }

        try {
          const confirmationDetails = await tool.shouldConfirmExecute(
            pendingToolCall.args,
          );
          if (confirmationDetails) {
            return { ...pendingToolCall, confirmationDetails };
          }
          const result = await tool.execute(pendingToolCall.args, signal);
          return {
            ...pendingToolCall,
            result,
            confirmationDetails: undefined,
          };
        } catch (execError: unknown) {
          return {
            ...pendingToolCall,
            error: new Error(
              `Tool execution failed: ${execError instanceof Error ? execError.message : String(execError)}`,
            ),
            confirmationDetails: undefined,
          };
        }
      },
    );
    const outcomes = await Promise.all(toolPromises);

    // Process outcomes and prepare function responses
    this.pendingToolCalls = []; // Clear pending calls for this turn

    for (const outcome of outcomes) {
      if (outcome.confirmationDetails) {
        this.confirmationDetails.push(outcome.confirmationDetails);
        const serverConfirmationetails: ServerToolCallConfirmationDetails = {
          request: {
            callId: outcome.callId,
            name: outcome.name,
            args: outcome.args,
          },
          details: outcome.confirmationDetails,
        };
        yield {
          type: GeminiEventType.ToolCallConfirmation,
          value: serverConfirmationetails,
        };
      }
      const responsePart = this.buildFunctionResponse(outcome);
      this.fnResponses.push(responsePart);
      const responseInfo: ToolCallResponseInfo = {
        callId: outcome.callId,
        responsePart,
        resultDisplay: outcome.result?.returnDisplay,
        error: outcome.error,
      };

      // If aborted we're already yielding the user cancellations elsewhere.
      if (!signal?.aborted) {
        yield { type: GeminiEventType.ToolCallResponse, value: responseInfo };
      }
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

  // Builds the Part array expected by the Google GenAI API
  private buildFunctionResponse(outcome: ServerToolExecutionOutcome): Part {
    const { name, result, error } = outcome;
    if (error) {
      // Format error for the LLM
      const errorMessage = error?.message || String(error);
      console.error(`[Server Turn] Error executing tool ${name}:`, error);
      return {
        functionResponse: {
          name,
          id: outcome.callId,
          response: { error: `Tool execution failed: ${errorMessage}` },
        },
      };
    }
    return {
      functionResponse: {
        name,
        id: outcome.callId,
        response: { output: result?.llmContent ?? '' },
      },
    };
  }

  getConfirmationDetails(): ToolCallConfirmationDetails[] {
    return this.confirmationDetails;
  }

  getFunctionResponses(): Part[] {
    return this.fnResponses;
  }

  getDebugResponses(): GenerateContentResponse[] {
    return this.debugResponses;
  }
}
