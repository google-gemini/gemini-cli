/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { getDebugSessionManager } from '../debug/session-store.js';
import { formatSessionSummary } from '../debug/debug-analyzer.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { DEBUG_DISCONNECT_TOOL_NAME } from './tool-names.js';

interface DebugDisconnectParams {
  terminate?: boolean;
}

class DebugDisconnectInvocation extends BaseToolInvocation<
  DebugDisconnectParams,
  ToolResult
> {
  getDescription(): string {
    return 'Disconnect debug session';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const session = manager.getActiveSession();
    await manager.disconnectSession(this.params.terminate ?? false);

    const summary = formatSessionSummary({
      runtime: session?.runtime ?? 'node',
      breakpointsHit: 0,
      errorsFound: [],
      stepsPerformed: 0,
    });

    return {
      llmContent: `Disconnected debug session.\n\n${summary}`,
      returnDisplay: `Disconnected debug session (terminate: ${String(this.params.terminate ?? false)}).`,
    };
  }
}

export class DebugDisconnectTool extends BaseDeclarativeTool<
  DebugDisconnectParams,
  ToolResult
> {
  static readonly Name = DEBUG_DISCONNECT_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_DISCONNECT_TOOL_NAME,
      'DebugDisconnect',
      'Disconnect and optionally terminate the active debug session.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          terminate: { type: 'boolean' },
        },
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugDisconnectParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugDisconnectParams, ToolResult> {
    return new DebugDisconnectInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
