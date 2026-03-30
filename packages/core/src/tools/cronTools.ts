/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import { cronSchedulerService } from '../services/cronSchedulerService.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { Type, type FunctionDeclaration } from '@google/genai';

// --- Declarations ---

export const SCHEDULE_TASK_TOOL_NAME = 'schedule_task';
export const LIST_TASKS_TOOL_NAME = 'list_scheduled_tasks';
export const CANCEL_TASK_TOOL_NAME = 'cancel_scheduled_task';

export const SCHEDULE_TASK_DECLARATION: FunctionDeclaration = {
  name: SCHEDULE_TASK_TOOL_NAME,
  description: 'Schedules a prompt to run after a specified interval.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      interval: {
        type: Type.STRING,
        description: 'Interval string like "10s", "5m", "1h".',
      },
      prompt: {
        type: Type.STRING,
        description: 'The prompt to run when the task triggers.',
      },
      recurring: {
        type: Type.BOOLEAN,
        description: 'Whether the task should run repeatedly.',
      },
    },
    required: ['interval', 'prompt'],
  },
};

export const LIST_TASKS_DECLARATION: FunctionDeclaration = {
  name: LIST_TASKS_TOOL_NAME,
  description: 'Lists all currently scheduled tasks.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const CANCEL_TASK_DECLARATION: FunctionDeclaration = {
  name: CANCEL_TASK_TOOL_NAME,
  description: 'Cancels a scheduled task by ID.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: {
        type: Type.STRING,
        description: 'The ID of the task to cancel.',
      },
    },
    required: ['id'],
  },
};

// --- Invocations ---

interface ScheduleTaskParams {
  interval: string;
  prompt: string;
  recurring?: boolean;
}

class ScheduleTaskInvocation extends BaseToolInvocation<
  ScheduleTaskParams,
  ToolResult
> {
  constructor(
    params: ScheduleTaskParams,
    messageBus: MessageBus,
    toolName: string,
  ) {
    super(params, messageBus, toolName);
  }

  override getDescription(): string {
    return `Schedule task: ${this.params.prompt} (Interval: ${this.params.interval})`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const isRecurring = this.params.recurring !== false;
      const id = cronSchedulerService.scheduleTask(
        this.params.interval,
        this.params.prompt,
        isRecurring,
      );
      return {
        llmContent: `Task scheduled successfully. ID: ${id}`,
        returnDisplay: `Task scheduled successfully. ID: ${id}`,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        llmContent: `Error scheduling task: ${message}`,
        returnDisplay: `Error scheduling task: ${message}`,
      };
    }
  }

  override async getConfirmationDetails() {
    return false as const;
  }
}

class ListTasksInvocation extends BaseToolInvocation<object, ToolResult> {
  constructor(params: object, messageBus: MessageBus, toolName: string) {
    super(params, messageBus, toolName);
  }

  override getDescription(): string {
    return 'List scheduled tasks';
  }

  async execute(): Promise<ToolResult> {
    const tasks = cronSchedulerService.listTasks();
    if (tasks.length === 0) {
      return {
        llmContent: 'No scheduled tasks.',
        returnDisplay: 'No scheduled tasks.',
      };
    }
    const lines = tasks.map(
      (t) =>
        `- ID: ${t.id}, Interval: ${t.intervalMs}ms, Prompt: "${t.prompt}", Recurring: ${t.isRecurring}`,
    );
    return { llmContent: lines.join('\n'), returnDisplay: lines.join('\n') };
  }

  override async getConfirmationDetails() {
    return false as const;
  }
}

interface CancelTaskParams {
  id: string;
}

class CancelTaskInvocation extends BaseToolInvocation<
  CancelTaskParams,
  ToolResult
> {
  constructor(
    params: CancelTaskParams,
    messageBus: MessageBus,
    toolName: string,
  ) {
    super(params, messageBus, toolName);
  }

  override getDescription(): string {
    return `Cancel task ID: ${this.params.id}`;
  }

  async execute(): Promise<ToolResult> {
    const success = cronSchedulerService.cancelTask(this.params.id);
    if (success) {
      return {
        llmContent: `Task ${this.params.id} cancelled successfully.`,
        returnDisplay: `Task ${this.params.id} cancelled successfully.`,
      };
    }
    return {
      llmContent: `Task ${this.params.id} not found.`,
      returnDisplay: `Task ${this.params.id} not found.`,
    };
  }

  override async getConfirmationDetails() {
    return false as const;
  }
}

// --- Tools ---

export class ScheduleTaskTool extends BaseDeclarativeTool<
  ScheduleTaskParams,
  ToolResult
> {
  constructor(messageBus: MessageBus) {
    super(
      SCHEDULE_TASK_TOOL_NAME,
      'ScheduleTask',
      SCHEDULE_TASK_DECLARATION.description ?? '',
      Kind.Other,
      SCHEDULE_TASK_DECLARATION.parameters,
      messageBus,
    );
  }

  protected createInvocation(
    params: ScheduleTaskParams,
    messageBus: MessageBus,
  ): ScheduleTaskInvocation {
    return new ScheduleTaskInvocation(params, messageBus, this.name);
  }
}

export class ListTasksTool extends BaseDeclarativeTool<object, ToolResult> {
  constructor(messageBus: MessageBus) {
    super(
      LIST_TASKS_TOOL_NAME,
      'ListTasks',
      LIST_TASKS_DECLARATION.description ?? '',
      Kind.Other,
      LIST_TASKS_DECLARATION.parameters,
      messageBus,
    );
  }

  protected createInvocation(
    params: object,
    messageBus: MessageBus,
  ): ListTasksInvocation {
    return new ListTasksInvocation(params, messageBus, this.name);
  }
}

export class CancelTaskTool extends BaseDeclarativeTool<
  CancelTaskParams,
  ToolResult
> {
  constructor(messageBus: MessageBus) {
    super(
      CANCEL_TASK_TOOL_NAME,
      'CancelTask',
      CANCEL_TASK_DECLARATION.description ?? '',
      Kind.Other,
      CANCEL_TASK_DECLARATION.parameters,
      messageBus,
    );
  }

  protected createInvocation(
    params: CancelTaskParams,
    messageBus: MessageBus,
  ): CancelTaskInvocation {
    return new CancelTaskInvocation(params, messageBus, this.name);
  }
}
