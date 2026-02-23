/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ShellCompletionProvider, CompletionResult } from './types.js';
import { escapeShellPath } from '../useShellCompletion.js';

const execFileAsync = promisify(execFile);

const GIT_SUBCOMMANDS = [
  'add',
  'branch',
  'checkout',
  'commit',
  'diff',
  'merge',
  'pull',
  'push',
  'rebase',
  'status',
  'switch',
];

export const gitProvider: ShellCompletionProvider = {
  command: 'git',
  async getCompletions(
    tokens: string[],
    cursorIndex: number,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    // We are completing the first argument (subcommand)
    if (cursorIndex === 1) {
      const partial = tokens[1] || '';
      return {
        suggestions: GIT_SUBCOMMANDS.filter((cmd) =>
          cmd.startsWith(partial),
        ).map((cmd) => ({
          label: cmd,
          value: cmd,
          description: 'git command',
        })),
        exclusive: true,
      };
    }

    // We are completing the second argument (e.g. branch name)
    if (cursorIndex === 2) {
      const subcommand = tokens[1];
      if (
        subcommand === 'checkout' ||
        subcommand === 'switch' ||
        subcommand === 'merge' ||
        subcommand === 'branch'
      ) {
        const partial = tokens[2] || '';
        try {
          const { stdout } = await execFileAsync(
            'git',
            ['branch', '--format=%(refname:short)'],
            { cwd, signal },
          );

          const branches = stdout
            .split('\n')
            .map((b) => b.trim())
            .filter(Boolean);

          return {
            suggestions: branches
              .filter((b) => b.startsWith(partial))
              .map((b) => ({
                label: b,
                value: escapeShellPath(b),
                description: 'branch',
              })),
            exclusive: true,
          };
        } catch {
          // If git fails (e.g. not a git repo), return nothing
          return { suggestions: [], exclusive: true };
        }
      }
    }

    // Unhandled git argument, fallback to default file completions
    return { suggestions: [], exclusive: false };
  },
};
