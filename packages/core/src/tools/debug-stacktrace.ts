/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { getDebugSessionManager } from '../debug/session-store.js';
import { formatStackTrace } from '../debug/debug-analyzer.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { DEBUG_STACKTRACE_TOOL_NAME } from './tool-names.js';

interface DebugStacktraceParams {
  thread_id?: number;
  levels?: number;
}

class DebugStacktraceInvocation extends BaseToolInvocation<
  DebugStacktraceParams,
  ToolResult
> {
  getDescription(): string {
    return 'Inspect current stack trace';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const frames = await manager.getStackTrace(
      this.params.thread_id,
      this.params.levels ?? 20,
    );
    const formatted = formatStackTrace(frames, {
      maxFrames: this.params.levels ?? 20,
      includeModuleId: true,
    });

    return {
      llmContent: formatted,
      returnDisplay: `Retrieved ${frames.length} stack frame(s).`,
    };
  }
}

export class DebugStacktraceTool extends BaseDeclarativeTool<
  DebugStacktraceParams,
  ToolResult
> {
  static readonly Name = DEBUG_STACKTRACE_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_STACKTRACE_TOOL_NAME,
      'DebugStacktrace',
      'Inspect stack frames for a stopped thread in the active debug session.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          thread_id: { type: 'number' },
          levels: { type: 'number' },
        },
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugStacktraceParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugStacktraceParams, ToolResult> {
    return new DebugStacktraceInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
