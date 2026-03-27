/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * /debugger slash command — Interactive Debug Companion.
 *
 * Provides an entry point for the terminal-integrated debugging experience.
 * Subcommands allow launching, attaching, inspecting, and disconnecting
 * debug sessions directly from the CLI prompt.
 */

import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';
import type { MessageActionReturn } from '@google/gemini-cli-core';

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

const launchSubcommand: SlashCommand = {
  name: 'launch',
  description:
    'Launch a debug session for a program. Usage: /debugger launch <file>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (_context, args): Promise<SlashCommandActionReturn> => {
    const program = (args ?? '').trim();
    if (!program) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Missing program path. Usage: /debugger launch <file>\n\nExample: /debugger launch ./src/index.js',
      };
    }

    return {
      type: 'submit_prompt',
      content: `Launch a debug session for the program \`${program}\`. Use the debug_launch tool to start the debugger, then report the initial state.`,
    };
  },
};

const attachSubcommand: SlashCommand = {
  name: 'attach',
  description:
    'Attach to a running debug process. Usage: /debugger attach <port> [host]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (_context, args): Promise<SlashCommandActionReturn> => {
    const parts = (args ?? '').trim().split(/\s+/);
    const port = parts[0];

    if (!port) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Missing port number. Usage: /debugger attach <port> [host]\n\nExample: /debugger attach 9229',
      };
    }

    const host = parts[1] ?? '127.0.0.1';

    return {
      type: 'submit_prompt',
      content: `Attach the debugger to the process running at ${host}:${port}. Use the debug_attach tool, then report the session state.`,
    };
  },
};

const statusSubcommand: SlashCommand = {
  name: 'status',
  description: 'Show the current debug session status',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (): Promise<SlashCommandActionReturn> => ({
      type: 'submit_prompt',
      content:
        'Check the current debug session status. If a session is active, use debug_get_stacktrace to show where execution is paused and debug_get_variables to show local variables. If no session is active, inform me.',
    }),
};

const disconnectSubcommand: SlashCommand = {
  name: 'disconnect',
  description: 'End the current debug session',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (): Promise<SlashCommandActionReturn> => ({
      type: 'submit_prompt',
      content:
        'Disconnect the current debug session using the debug_disconnect tool. Terminate the debuggee process.',
    }),
};

// ---------------------------------------------------------------------------
// Main /debugger command
// ---------------------------------------------------------------------------

export const debuggerCommand: SlashCommand = {
  name: 'debugger',
  description:
    'Interactive Debug Companion — launch, attach, inspect, and control debug sessions',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (_context, args): Promise<MessageActionReturn> => {
    const subcommand = (args ?? '').trim();

    if (subcommand) {
      // If user typed `/debugger <something>` without matching a subcommand,
      // treat it as a free-form debug request
      return {
        type: 'message',
        messageType: 'info',
        content: `To debug "${subcommand}", try:\n  /debugger launch ${subcommand}\n  /debugger attach <port>`,
      };
    }

    // No args — show help
    return {
      type: 'message',
      messageType: 'info',
      content: [
        '🔍 Debug Companion — Available commands:',
        '',
        '  /debugger launch <file>        Launch a debug session',
        '  /debugger attach <port> [host]  Attach to a running process',
        '  /debugger status               Show current session status',
        '  /debugger disconnect            End the debug session',
        '',
        'Or describe your bug in natural language — the AI will use',
        'the debug tools automatically.',
      ].join('\n'),
    };
  },
  subCommands: [
    launchSubcommand,
    attachSubcommand,
    statusSubcommand,
    disconnectSubcommand,
  ],
};
