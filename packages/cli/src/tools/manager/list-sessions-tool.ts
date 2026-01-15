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
  properties: {},
};

type Parameters = Record<string, never>;

export class ListSessionsTool extends BaseDeclarativeTool<
  Parameters,
  ToolResult
> {
  static readonly Name = 'list_sessions';

  constructor(
    private readonly sessionManager: SessionManager,
    messageBus: MessageBus,
  ) {
    super(
      ListSessionsTool.Name,
      'List Sessions',
      'Lists all active Gemini CLI sessions and their statuses.',
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
    return new ListSessionsInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.sessionManager,
    );
  }
}

class ListSessionsInvocation extends BaseToolInvocation<
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
    return `Listing active sessions`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const sessions = this.sessionManager.getSessions();
    const tasks = this.sessionManager.getTasks();

    if (sessions.length === 0 && tasks.length === 0) {
      return {
        llmContent: 'No active sessions or planned tasks found.',
        returnDisplay: 'No active sessions or planned tasks found.',
      };
    }

    let output = '';

    if (tasks.length > 0) {
      output += '## Workflow Plan\n';
      output += tasks
        .map((t) => {
          const icon =
            t.status === 'completed'
              ? '✅'
              : t.status === 'running'
                ? '🔄'
                : t.status === 'failed'
                  ? '❌'
                  : t.status === 'blocked'
                    ? '🔒'
                    : '⏳';
          return `- ${icon} **${t.id}**: ${t.description}\n  - Status: ${t.status}\n  - Dependencies: ${t.dependencies.length ? t.dependencies.join(', ') : 'None'}`;
        })
        .join('\n');
      output += '\n\n';
    }

    if (sessions.length > 0) {
      output += '## Active Sessions\n';
      output += sessions
        .map((s) => {
          const waiting =
            s.status === 'waiting_for_input' ? '⚠️ WAITING FOR INPUT' : '';
          return `- **ID**: ${s.id}\n  - Branch: ${s.branchName}\n  - Status: ${s.status} ${waiting}\n  - PID: ${s.pid}\n  - Task: ${s.taskDescription}`;
        })
        .join('\n');
    }

    return {
      llmContent: output,
      returnDisplay: output,
    };
  }
}
