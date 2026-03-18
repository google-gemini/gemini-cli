/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  type ToolResult,
  Kind,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { SCHEDULE_WORK_TOOL_NAME } from './tool-names.js';
import type { WorkScheduler } from '../services/work-scheduler.js';

export interface ScheduleWorkParams {
  action: 'add' | 'cancel';
  prompt?: string;
  at?: string;
  inMinutes?: number;
  id?: string;
}

export class ScheduleWorkTool extends BaseDeclarativeTool<
  ScheduleWorkParams,
  ToolResult
> {
  private readonly scheduler: WorkScheduler;

  constructor(messageBus: MessageBus, scheduler: WorkScheduler) {
    super(
      SCHEDULE_WORK_TOOL_NAME,
      'Schedule Work',
      'Manage a scheduled work list. Schedule prompts to be automatically injected at specific times (queued if the agent is busy). The current schedule is always visible in the context prepended to each message. The "at" parameter is interpreted as the system\'s local timezone.',
      Kind.Communicate,
      {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'cancel'],
            description:
              'Action to perform: "add" to schedule a new item, "cancel" to remove a scheduled item.',
          },
          prompt: {
            type: 'string',
            description:
              'The prompt to inject when the scheduled time arrives. Required for "add".',
          },
          at: {
            type: 'string',
            description:
              'Absolute local time to fire the prompt, in ISO 8601 format without timezone offset (e.g. "2025-01-15T14:30:00"). Interpreted as the system\'s local timezone. Mutually exclusive with inMinutes. One of "at" or "inMinutes" is required for "add".',
          },
          inMinutes: {
            type: 'number',
            description:
              'Minutes from now to fire the prompt. Mutually exclusive with "at". One of "at" or "inMinutes" is required for "add".',
          },
          id: {
            type: 'string',
            description:
              'ID of the scheduled item to cancel. Required for "cancel". The current schedule with IDs is visible in the context prepended to each message.',
          },
        },
      },
      messageBus,
    );
    this.scheduler = scheduler;
  }

  protected override validateToolParamValues(
    params: ScheduleWorkParams,
  ): string | null {
    if (params.action === 'add') {
      if (!params.prompt || params.prompt.trim() === '') {
        return '"prompt" is required for action "add".';
      }
      if (params.at == null && params.inMinutes == null) {
        return 'One of "at" or "inMinutes" is required for action "add".';
      }
      if (params.at != null && params.inMinutes != null) {
        return '"at" and "inMinutes" are mutually exclusive.';
      }
      if (params.inMinutes != null && params.inMinutes <= 0) {
        return '"inMinutes" must be greater than 0.';
      }
      if (params.at != null) {
        const parsed = new Date(params.at);
        if (isNaN(parsed.getTime())) {
          return `Invalid date format for "at": "${params.at}". Use ISO 8601 format (e.g. "2025-01-15T14:30:00").`;
        }
      }
    }
    if (params.action === 'cancel') {
      if (!params.id || params.id.trim() === '') {
        return '"id" is required for action "cancel".';
      }
    }
    return null;
  }

  protected createInvocation(
    params: ScheduleWorkParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
  ): ScheduleWorkInvocation {
    return new ScheduleWorkInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.scheduler,
    );
  }
}

export class ScheduleWorkInvocation extends BaseToolInvocation<
  ScheduleWorkParams,
  ToolResult
> {
  private readonly scheduler: WorkScheduler;

  constructor(
    params: ScheduleWorkParams,
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
    scheduler: WorkScheduler,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
    this.scheduler = scheduler;
  }

  getDescription(): string {
    switch (this.params.action) {
      case 'add':
        if (this.params.inMinutes) {
          return `Scheduling work to fire in ${this.params.inMinutes} minutes.`;
        }
        return `Scheduling work to fire at ${this.params.at}.`;
      case 'cancel':
        return `Cancelling scheduled item ${this.params.id}.`;
      default:
        return 'Managing scheduled work.';
    }
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    switch (this.params.action) {
      case 'add':
        return this.handleAdd();
      case 'cancel':
        return this.handleCancel();
      default:
        return {
          llmContent: `Unknown action: "${String(this.params.action)}". Use "add" or "cancel".`,
          returnDisplay: 'Unknown action.',
          error: { message: 'Unknown action.' },
        };
    }
  }

  private handleAdd(): ToolResult {
    const prompt = this.params.prompt!;
    let item;

    if (this.params.inMinutes != null) {
      item = this.scheduler.addRelative(prompt, this.params.inMinutes);
    } else {
      // Parse "at" as local time
      const fireAt = new Date(this.params.at!);
      item = this.scheduler.add(prompt, fireAt);
    }

    const summary = this.scheduler.formatScheduleSummary();
    return {
      llmContent: `Scheduled item [${item.id.slice(0, 8)}] created. Will fire at ${item.fireAt.toISOString()}.\n\n${summary}`,
      returnDisplay: `Scheduled: "${prompt}" at ${item.fireAt.toLocaleTimeString()}`,
    };
  }

  private handleCancel(): ToolResult {
    const id = this.params.id!;
    // Allow matching by full ID or prefix
    const pending = this.scheduler.getPendingItems();
    const match = pending.find(
      (item) => item.id === id || item.id.startsWith(id),
    );

    if (!match) {
      const summary = this.scheduler.formatScheduleSummary();
      return {
        llmContent: `No pending item found with ID "${id}".\n\n${summary}`,
        returnDisplay: `Item not found: ${id}`,
        error: { message: `No pending item found with ID "${id}".` },
      };
    }

    this.scheduler.cancel(match.id);
    const summary = this.scheduler.formatScheduleSummary();
    return {
      llmContent: `Cancelled item [${match.id.slice(0, 8)}] — "${match.prompt}".\n\n${summary}`,
      returnDisplay: `Cancelled: "${match.prompt}"`,
    };
  }
}
