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
      description: 'The ID of the session to stop.',
    },
  },
  required: ['sessionId'],
};

interface Parameters {
  sessionId: string;
}

export class StopSessionTool extends BaseDeclarativeTool<
  Parameters,
  ToolResult
> {
  static readonly Name = 'stop_session';

  constructor(
    private readonly sessionManager: SessionManager,
    messageBus: MessageBus,
  ) {
    super(
      StopSessionTool.Name,
      'Stop Session',
      'Stops (kills) a running worker session. Use this if a session is hung or no longer needed.',
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
    return new StopSessionInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.sessionManager,
    );
  }
}

class StopSessionInvocation extends BaseToolInvocation<Parameters, ToolResult> {
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
    return `Stopping session ${this.params.sessionId}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    await this.sessionManager.stopSession(this.params.sessionId);

    return {
      llmContent: `Session ${this.params.sessionId} has been stopped.`,
      returnDisplay: `Session ${this.params.sessionId} has been stopped.`,
    };
  }
}
