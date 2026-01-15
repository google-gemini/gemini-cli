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
    taskDescription: {
      type: 'string',
      description:
        'The description of the task to be performed in the new session.',
    },
    branchName: {
      type: 'string',
      description: 'The name of the git branch to create for this session.',
    },
  },
  required: ['taskDescription', 'branchName'],
};

interface Parameters {
  taskDescription: string;
  branchName: string;
}

export class StartSessionTool extends BaseDeclarativeTool<
  Parameters,
  ToolResult
> {
  static readonly Name = 'start_session';

  constructor(
    private readonly sessionManager: SessionManager,
    messageBus: MessageBus,
  ) {
    super(
      StartSessionTool.Name,
      'Start Session',
      'Starts a new Gemini CLI session in an isolated git worktree to perform a task.',
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
    return new StartSessionInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.sessionManager,
    );
  }
}

class StartSessionInvocation extends BaseToolInvocation<
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
    return `Starting session for task: "${this.params.taskDescription}" on branch "${this.params.branchName}"`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const session = await this.sessionManager.startSession(
        this.params.taskDescription,
        this.params.branchName,
      );

      const msg = `Session started successfully.\nID: ${session.id}\nBranch: ${session.branchName}\nWorktree: ${session.worktreePath}\nStatus: ${session.status}`;
      return {
        llmContent: msg,
        returnDisplay: msg,
      };
    } catch (error) {
      const msg = `Failed to start session: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: msg,
        returnDisplay: msg,
        error: { message: msg },
      };
    }
  }
}
