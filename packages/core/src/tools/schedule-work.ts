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

export interface ScheduleWorkParams {
  inMinutes: number;
}

export class ScheduleWorkTool extends BaseDeclarativeTool<
  ScheduleWorkParams,
  ToolResult
> {
  constructor(messageBus: MessageBus) {
    super(
      SCHEDULE_WORK_TOOL_NAME,
      'Schedule Work',
      'Schedule work to resume automatically after a break. Use this to wait for long-running processes or to pause your execution. The system will automatically wake you up.',
      Kind.Communicate,
      {
        type: 'object',
        required: ['inMinutes'],
        properties: {
          inMinutes: {
            type: 'number',
            description: 'Minutes to wait before automatically resuming work.',
          },
        },
      },
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: ScheduleWorkParams,
  ): string | null {
    if (params.inMinutes <= 0) {
      return 'inMinutes must be greater than 0.';
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
    );
  }
}

export class ScheduleWorkInvocation extends BaseToolInvocation<
  ScheduleWorkParams,
  ToolResult
> {
  getDescription(): string {
    return `Scheduling work to resume in ${this.params.inMinutes} minutes.`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    return {
      llmContent: `Work scheduled. The system will wake you up in ${this.params.inMinutes} minutes. DO NOT make any further tool calls. Instead, provide a brief text summary of the work completed so far to end your turn.`,
      returnDisplay: `Scheduled work to resume in ${this.params.inMinutes} minutes.`,
    };
  }
}
