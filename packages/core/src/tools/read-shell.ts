/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import {
  READ_SHELL_TOOL_NAME,
  READ_SHELL_PARAM_PID,
  READ_SHELL_PARAM_WAIT_SECONDS,
} from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

export interface ReadShellParams {
  pid: number;
  wait_seconds?: number;
}

export class ReadShellToolInvocation extends BaseToolInvocation<
  ReadShellParams,
  ToolResult
> {
  constructor(
    params: ReadShellParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const waitPart =
      this.params.wait_seconds !== undefined
        ? ` (after ${this.params.wait_seconds}s)`
        : '';
    return `read shell screen PID ${this.params.pid}${waitPart}`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const { pid, wait_seconds } = this.params;

    // Wait before reading if requested
    if (wait_seconds !== undefined && wait_seconds > 0) {
      const waitMs = Math.min(wait_seconds, 30) * 1000; // Cap at 30s
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, waitMs);
        const onAbort = () => {
          clearTimeout(timer);
          resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
      });
    }

    // Validate the PID is active
    if (!ShellExecutionService.isPtyActive(pid)) {
      return {
        llmContent: `Error: No active process found with PID ${pid}. The process may have exited.`,
        returnDisplay: `No active process with PID ${pid}.`,
      };
    }

    const screen = ShellExecutionService.readScreen(pid);
    if (screen === null) {
      return {
        llmContent: `Error: Could not read screen for PID ${pid}. The process may have exited.`,
        returnDisplay: `Could not read screen for PID ${pid}.`,
      };
    }

    return {
      llmContent: screen,
      returnDisplay: `Screen read from PID ${pid} (${screen.split('\n').length} lines).`,
    };
  }
}

export class ReadShellTool extends BaseDeclarativeTool<
  ReadShellParams,
  ToolResult
> {
  static readonly Name = READ_SHELL_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      ReadShellTool.Name,
      'ReadShell',
      'Reads the current screen state of a running background shell process. Returns the rendered terminal screen as text, preserving the visual layout. Use after write_to_shell to see updated output, or to check progress of a running command.',
      Kind.Read,
      {
        type: 'object',
        properties: {
          [READ_SHELL_PARAM_PID]: {
            type: 'number',
            description:
              'The PID of the background process to read from. Obtained from a previous run_shell_command call that was auto-promoted to background or started with is_background=true.',
          },
          [READ_SHELL_PARAM_WAIT_SECONDS]: {
            type: 'number',
            description:
              'Seconds to wait before reading the screen. Use this to let the process run for a while before checking output (e.g. wait for a build to finish). Max 30 seconds.',
          },
        },
        required: [READ_SHELL_PARAM_PID],
      },
      messageBus,
      false, // output is not markdown
    );
  }

  protected override validateToolParamValues(
    params: ReadShellParams,
  ): string | null {
    if (!params.pid || params.pid <= 0) {
      return 'PID must be a positive number.';
    }
    if (
      params.wait_seconds !== undefined &&
      (params.wait_seconds < 0 || params.wait_seconds > 30)
    ) {
      return 'wait_seconds must be between 0 and 30.';
    }
    return null;
  }

  protected createInvocation(
    params: ReadShellParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<ReadShellParams, ToolResult> {
    return new ReadShellToolInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
