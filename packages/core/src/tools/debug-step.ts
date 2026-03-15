/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { getDebugSessionManager } from '../debug/session-store.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { DEBUG_STEP_TOOL_NAME } from './tool-names.js';

interface DebugStepParams {
  action: 'over' | 'into' | 'out';
  thread_id?: number;
}

class DebugStepInvocation extends BaseToolInvocation<
  DebugStepParams,
  ToolResult
> {
  getDescription(): string {
    return `Step ${this.params.action} in debugger`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();

    if (this.params.action === 'over') {
      await manager.stepOver(this.params.thread_id);
    } else if (this.params.action === 'into') {
      await manager.stepIn(this.params.thread_id);
    } else {
      await manager.stepOut(this.params.thread_id);
    }

    return {
      llmContent: `Stepped ${this.params.action}.`,
      returnDisplay: `Stepped ${this.params.action}.`,
    };
  }
}

export class DebugStepTool extends BaseDeclarativeTool<
  DebugStepParams,
  ToolResult
> {
  static readonly Name = DEBUG_STEP_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_STEP_TOOL_NAME,
      'DebugStep',
      'Step over, into, or out in the current debug session.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['over', 'into', 'out'],
          },
          thread_id: { type: 'number' },
        },
        required: ['action'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugStepParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugStepParams, ToolResult> {
    return new DebugStepInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
