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
import {
  type SessionManager,
  type WorkflowTask,
} from '../../services/session-manager.js';

const ParametersSchema = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique identifier for the task.',
          },
          description: {
            type: 'string',
            description: 'Detailed instruction for the agent.',
          },
          branchName: {
            type: 'string',
            description: 'Git branch name for the task.',
          },
          dependencies: {
            type: 'array',
            items: { type: 'string' },
            description:
              'List of task IDs that must complete before this task starts.',
          },
        },
        required: ['id', 'description', 'branchName'],
      },
      description: 'List of tasks to execute in the workflow.',
    },
  },
  required: ['tasks'],
};

interface Parameters {
  tasks: Array<Omit<WorkflowTask, 'status' | 'assignedSessionId'>>;
}

export class PlanWorkflowTool extends BaseDeclarativeTool<
  Parameters,
  ToolResult
> {
  static readonly Name = 'plan_workflow';

  constructor(
    private readonly sessionManager: SessionManager,
    messageBus: MessageBus,
  ) {
    super(
      PlanWorkflowTool.Name,
      'Plan Workflow',
      'Defines a sequence of tasks with dependencies to be executed by the manager. The manager will automatically sequence them.',
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
    return new PlanWorkflowInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.sessionManager,
    );
  }
}

class PlanWorkflowInvocation extends BaseToolInvocation<
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
    return `Planning workflow with ${this.params.tasks.length} tasks.`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      await this.sessionManager.planWorkflow(this.params.tasks);

      const taskList = this.params.tasks
        .map(
          (t) =>
            `- ${t.id}: ${t.description} (Depends on: ${t.dependencies?.join(', ') || 'None'})`,
        )
        .join('\n');

      const msg = `Workflow planned successfully. Tasks have been queued and will start based on dependencies.\n\n${taskList}`;

      return {
        llmContent: msg,
        returnDisplay: msg,
      };
    } catch (error) {
      const msg = `Failed to plan workflow: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: msg,
        returnDisplay: msg,
        error: { message: msg },
      };
    }
  }
}
