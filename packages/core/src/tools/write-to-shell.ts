/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type ToolConfirmationOutcome,
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
  type ToolCallConfirmationDetails,
  type ToolExecuteConfirmationDetails,
} from './tools.js';
import { ShellExecutionService } from '../services/shellExecutionService.js';
import {
  WRITE_TO_SHELL_TOOL_NAME,
  WRITE_TO_SHELL_PARAM_PID,
  WRITE_TO_SHELL_PARAM_INPUT,
  WRITE_TO_SHELL_PARAM_SPECIAL_KEYS,
} from './tool-names.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

/**
 * Mapping of named special keys to their ANSI escape sequences.
 */
const SPECIAL_KEY_MAP: Record<string, string> = {
  Enter: '\r',
  Tab: '\t',
  Up: '\x1b[A',
  Down: '\x1b[B',
  Left: '\x1b[D',
  Right: '\x1b[C',
  Escape: '\x1b',
  Backspace: '\x7f',
  'Ctrl-C': '\x03',
  'Ctrl-D': '\x04',
  'Ctrl-Z': '\x1a',
  Space: ' ',
  Delete: '\x1b[3~',
  Home: '\x1b[H',
  End: '\x1b[F',
};

const VALID_SPECIAL_KEYS = Object.keys(SPECIAL_KEY_MAP);

/** Delay in ms to wait after writing input for the process to react. */
const POST_INPUT_DELAY_MS = 150;

export interface WriteToShellParams {
  pid: number;
  input?: string;
  special_keys?: string[];
}

export class WriteToShellToolInvocation extends BaseToolInvocation<
  WriteToShellParams,
  ToolResult
> {
  constructor(
    params: WriteToShellParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    const parts: string[] = [`write to shell PID ${this.params.pid}`];
    if (this.params.input) {
      const display =
        this.params.input.length > 50
          ? `${this.params.input.substring(0, 50)}...`
          : this.params.input;
      parts.push(`input: "${display}"`);
    }
    if (this.params.special_keys?.length) {
      parts.push(`keys: [${this.params.special_keys.join(', ')}]`);
    }
    return parts.join(' ');
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Input',
      command: this.getDescription(),
      rootCommand: 'write_to_shell',
      rootCommands: ['write_to_shell'],
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {
        // Policy updates handled centrally
      },
    };
    return confirmationDetails;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const { pid, input, special_keys } = this.params;

    // Validate the PID is active
    if (!ShellExecutionService.isPtyActive(pid)) {
      return {
        llmContent: `Error: No active process found with PID ${pid}. The process may have exited.`,
        returnDisplay: `No active process with PID ${pid}.`,
      };
    }

    // Validate special keys
    if (special_keys?.length) {
      const invalidKeys = special_keys.filter(
        (k) => !VALID_SPECIAL_KEYS.includes(k),
      );
      if (invalidKeys.length > 0) {
        return {
          llmContent: `Error: Invalid special keys: ${invalidKeys.join(', ')}. Valid keys are: ${VALID_SPECIAL_KEYS.join(', ')}`,
          returnDisplay: `Invalid special keys: ${invalidKeys.join(', ')}`,
        };
      }
    }

    // Send text input
    if (input) {
      ShellExecutionService.writeToPty(pid, input);
    }

    // Send special keys
    if (special_keys?.length) {
      for (const key of special_keys) {
        const sequence = SPECIAL_KEY_MAP[key];
        if (sequence) {
          ShellExecutionService.writeToPty(pid, sequence);
        }
      }
    }

    // Wait briefly for the process to react
    await new Promise((resolve) => setTimeout(resolve, POST_INPUT_DELAY_MS));

    // Read the screen after writing
    const screen = ShellExecutionService.readScreen(pid);
    if (screen === null) {
      return {
        llmContent: `Input sent, but the process (PID ${pid}) has exited.`,
        returnDisplay: `Process exited after input.`,
      };
    }

    return {
      llmContent: `Input sent to PID ${pid}. Current screen:\n${screen}`,
      returnDisplay: `Input sent to PID ${pid}.`,
    };
  }
}

export class WriteToShellTool extends BaseDeclarativeTool<
  WriteToShellParams,
  ToolResult
> {
  static readonly Name = WRITE_TO_SHELL_TOOL_NAME;

  constructor(messageBus: MessageBus) {
    super(
      WriteToShellTool.Name,
      'WriteToShell',
      'Sends input to a running background shell process. Use this to interact with TUI applications, REPLs, and interactive commands. After writing, the current screen state is returned. Works with processes that were auto-promoted to background via wait_for_output_seconds or started with is_background=true.',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          [WRITE_TO_SHELL_PARAM_PID]: {
            type: 'number',
            description:
              'The PID of the background process to write to. Obtained from a previous run_shell_command call that was auto-promoted to background or started with is_background=true.',
          },
          [WRITE_TO_SHELL_PARAM_INPUT]: {
            type: 'string',
            description:
              '(OPTIONAL) Text to send to the process. This is literal text typed into the terminal.',
          },
          [WRITE_TO_SHELL_PARAM_SPECIAL_KEYS]: {
            type: 'array',
            items: {
              type: 'string',
              enum: VALID_SPECIAL_KEYS,
            },
            description:
              '(OPTIONAL) Named special keys to send after the input text. Each key is sent in sequence. Examples: ["Enter"], ["Tab"], ["Up", "Enter"], ["Ctrl-C"].',
          },
        },
        required: [WRITE_TO_SHELL_PARAM_PID],
      },
      messageBus,
      false, // output is not markdown
    );
  }

  protected override validateToolParamValues(
    params: WriteToShellParams,
  ): string | null {
    if (!params.pid || params.pid <= 0) {
      return 'PID must be a positive number.';
    }
    if (
      !params.input &&
      (!params.special_keys || !params.special_keys.length)
    ) {
      return 'At least one of input or special_keys must be provided.';
    }
    return null;
  }

  protected createInvocation(
    params: WriteToShellParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<WriteToShellParams, ToolResult> {
    return new WriteToShellToolInvocation(
      params,
      messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
