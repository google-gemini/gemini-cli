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
      description: 'The ID of the session to tail.',
    },
    lines: {
      type: 'number',
      description: 'Number of lines to return (default 20).',
    },
  },
  required: ['sessionId'],
};

interface Parameters {
  sessionId: string;
  lines?: number;
}

export class TailSessionTool extends BaseDeclarativeTool<
  Parameters,
  ToolResult
> {
  static readonly Name = 'tail_session';

  constructor(
    private readonly sessionManager: SessionManager,
    messageBus: MessageBus,
  ) {
    super(
      TailSessionTool.Name,
      'Tail Session Output',
      'Retrieves the recent output (stdout/stderr) from a specific session to check its progress or see prompts.',
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
    return new TailSessionInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.sessionManager,
    );
  }
}

class TailSessionInvocation extends BaseToolInvocation<Parameters, ToolResult> {
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
    return `Tailing session ${this.params.sessionId}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const session = this.sessionManager
      .getSessions()
      .find((s) => s.id === this.params.sessionId);

    if (!session) {
      return {
        llmContent: 'Session not found.',
        returnDisplay: 'Session not found.',
        error: { message: 'Session not found' },
      };
    }

    const output = session.lastOutput || 'No output yet.';
    // Simple slice for now, SessionManager only stores last 200 chars which is small.
    // We should probably increase buffer in SessionManager if we want real tailing.

    return {
      llmContent: `Output for ${session.id}:\n\n${output}`,
      returnDisplay: `Output for ${session.id}:\n${output}`,
    };
  }
}
