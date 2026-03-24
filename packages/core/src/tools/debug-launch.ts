/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';
import { getDebugSessionManager } from '../debug/session-store.js';
import { type DebugRuntime } from '../debug/dap-types.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { DEBUG_LAUNCH_TOOL_NAME } from './tool-names.js';

interface DebugLaunchParams {
  runtime: DebugRuntime;
  program: string;
  args?: string[];
  cwd?: string;
  stop_on_entry?: boolean;
}

const debugRuntimeSchema = {
  type: 'string',
  enum: ['node', 'python', 'go'],
};

class DebugLaunchInvocation extends BaseToolInvocation<
  DebugLaunchParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: DebugLaunchParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return `Launch ${this.params.runtime} program ${this.params.program} under debugger`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const manager = getDebugSessionManager();
    const session = await manager.launchSession({
      runtime: this.params.runtime,
      program: this.params.program,
      args: this.params.args,
      cwd: this.params.cwd ?? this.config.getTargetDir(),
      stopOnEntry: this.params.stop_on_entry,
    });

    return {
      llmContent: `Launched debug session ${session.id} (${session.runtime}).`,
      returnDisplay: `Launched session ${session.id} (${session.runtime}) in launch mode.`,
    };
  }
}

export class DebugLaunchTool extends BaseDeclarativeTool<
  DebugLaunchParams,
  ToolResult
> {
  static readonly Name = DEBUG_LAUNCH_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      DEBUG_LAUNCH_TOOL_NAME,
      'DebugLaunch',
      'Launch a program under a DAP-compatible debugger session.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          runtime: debugRuntimeSchema,
          program: { type: 'string' },
          args: {
            type: 'array',
            items: { type: 'string' },
          },
          cwd: { type: 'string' },
          stop_on_entry: { type: 'boolean' },
        },
        required: ['runtime', 'program'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: DebugLaunchParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<DebugLaunchParams, ToolResult> {
    return new DebugLaunchInvocation(
      this.config,
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
