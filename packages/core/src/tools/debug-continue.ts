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
import { DEBUG_CONTINUE_TOOL_NAME } from './tool-names.js';

interface DebugContinueParams {
  thread_id?: number;
}

class DebugContinueInvocation extends BaseToolInvocation<
  DebugContinueParams,
  ToolResult
> {
  getDescription(): string {
    return 'Continue debug execution';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const result = await manager.continue(this.params.thread_id);

    return {
      llmContent: 'Resumed debug execution.',
      returnDisplay: `Resumed debug execution (allThreadsContinued: ${String(result.allThreadsContinued ?? true)}).`,
    };
  }
}

export class DebugContinueTool extends BaseDeclarativeTool<
  DebugContinueParams,
  ToolResult
> {
  static readonly Name = DEBUG_CONTINUE_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_CONTINUE_TOOL_NAME,
      'DebugContinue',
      'Resume execution of the active debug session.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          thread_id: { type: 'number' },
        },
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugContinueParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugContinueParams, ToolResult> {
    return new DebugContinueInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
