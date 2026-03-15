/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { getDebugSessionManager } from '../debug/session-store.js';
import { type SourceBreakpoint } from '../debug/dap-types.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { DEBUG_SET_BREAKPOINT_TOOL_NAME } from './tool-names.js';

interface DebugSetBreakpointParams {
  file_path: string;
  lines: number[];
  condition?: string;
}

class DebugSetBreakpointInvocation extends BaseToolInvocation<
  DebugSetBreakpointParams,
  ToolResult
> {
  getDescription(): string {
    return `Set breakpoints in ${this.params.file_path} at lines: ${this.params.lines.join(', ')}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const breakpoints: SourceBreakpoint[] = this.params.lines.map((line) => ({
      line,
      condition: this.params.condition,
    }));
    const created = await manager.setBreakpoints(
      this.params.file_path,
      breakpoints,
    );

    return {
      llmContent: `Configured ${created.length} breakpoint(s) in ${this.params.file_path}.`,
      returnDisplay: `Configured ${created.length} breakpoint(s).`,
    };
  }
}

export class DebugSetBreakpointTool extends BaseDeclarativeTool<
  DebugSetBreakpointParams,
  ToolResult
> {
  static readonly Name = DEBUG_SET_BREAKPOINT_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_SET_BREAKPOINT_TOOL_NAME,
      'DebugSetBreakpoint',
      'Set breakpoints in a source file for the active debug session.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
          lines: {
            type: 'array',
            items: { type: 'number' },
            minItems: 1,
          },
          condition: { type: 'string' },
        },
        required: ['file_path', 'lines'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugSetBreakpointParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugSetBreakpointParams, ToolResult> {
    return new DebugSetBreakpointInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
