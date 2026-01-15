/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  Kind,
  type ToolInvocation,
  type ToolResult,
  BaseToolInvocation,
  type MessageBus,
} from '@google/gemini-cli-core';
import { type SessionManager } from '../../services/session-manager.js';

const ParametersSchema = {
  type: 'object',
  properties: {
    sessionId: {
      type: 'string',
      description: 'The ID of the session to send input to.',
    },
    input: {
      type: 'string',
      description: 'The text input to send (e.g., "y", "no", "explain more").',
    },
  },
  required: ['sessionId', 'input'],
};

interface Parameters {
  sessionId: string;
  input: string;
}

export class SendSessionInputTool extends BaseDeclarativeTool<
  Parameters,
  ToolResult
> {
  static readonly Name = 'send_session_input';

  constructor(
    private readonly sessionManager: SessionManager,
    messageBus: MessageBus,
  ) {
    super(
      SendSessionInputTool.Name,
      'Send Input to Session',
      'Sends text input to a running session that is waiting for user interaction (e.g., confirming a tool call).',
      Kind.Execute,
      ParametersSchema,
      messageBus,
    );
  }

  protected createInvocation(
    params: Parameters,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
  ): ToolInvocation<Parameters, ToolResult> {
    return new SendSessionInputInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.sessionManager,
    );
  }
}

class SendSessionInputInvocation extends BaseToolInvocation<
  Parameters,
  ToolResult
> {
  constructor(
    params: Parameters,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
    private readonly sessionManager: SessionManager,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Sending input "${this.params.input}" to session ${this.params.sessionId}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const success = await this.sessionManager.sendInput(
      this.params.sessionId,
      this.params.input,
    );

    if (success) {
      return {
        llmContent: `Successfully sent input to session ${this.params.sessionId}.`,
        returnDisplay: `Sent "${this.params.input}" to ${this.params.sessionId}`,
      };
    } else {
      return {
        llmContent: `Failed to send input. Session ${this.params.sessionId} might not exist or is not running.`,
        returnDisplay: `Failed to send input to ${this.params.sessionId}`,
        error: { message: 'Session not found or process not writable.' },
      };
    }
  }
}
