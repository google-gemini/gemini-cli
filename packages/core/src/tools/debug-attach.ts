/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { getDebugSessionManager } from '../debug/session-store.js';
import { type DebugRuntime, DEFAULT_DEBUG_PORTS } from '../debug/dap-types.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { DEBUG_ATTACH_TOOL_NAME } from './tool-names.js';

interface DebugAttachParams {
  runtime: DebugRuntime;
  host?: string;
  port?: number;
  pid?: number;
}

const debugRuntimeSchema = {
  type: 'string',
  enum: ['node', 'python', 'go'],
};

class DebugAttachInvocation extends BaseToolInvocation<
  DebugAttachParams,
  ToolResult
> {
  getDescription(): string {
    return `Attach ${this.params.runtime} debugger to ${this.params.host ?? 'localhost'}:${this.params.port ?? DEFAULT_DEBUG_PORTS[this.params.runtime]}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const session = await manager.attachSession({
      runtime: this.params.runtime,
      host: this.params.host,
      port: this.params.port,
      pid: this.params.pid,
    });

    return {
      llmContent: `Attached debugger session ${session.id} (${session.runtime}).`,
      returnDisplay: `Attached session ${session.id} (${session.runtime}) in attach mode.`,
    };
  }
}

export class DebugAttachTool extends BaseDeclarativeTool<
  DebugAttachParams,
  ToolResult
> {
  static readonly Name = DEBUG_ATTACH_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      DEBUG_ATTACH_TOOL_NAME,
      'DebugAttach',
      'Attach to a running process through a DAP-compatible debugger endpoint.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          runtime: debugRuntimeSchema,
          host: { type: 'string' },
          port: { type: 'number' },
          pid: { type: 'number' },
        },
        required: ['runtime'],
      },
      messageBus,
    );
  }

  protected override validateToolParamValues(
    params: DebugAttachParams,
  ): string | null {
    if (!params.host) {
      return null;
    }

    const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);
    if (!allowedHosts.has(params.host)) {
      return `For security, debug_attach only supports localhost endpoints. Received host: ${params.host}`;
    }

    return null;
  }

  protected createInvocation(
    params: DebugAttachParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugAttachParams, ToolResult> {
    return new DebugAttachInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
