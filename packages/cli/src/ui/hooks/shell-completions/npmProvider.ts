/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ShellCompletionProvider, CompletionResult } from './types.js';
import { escapeShellPath } from '../useShellCompletion.js';

const NPM_SUBCOMMANDS = [
  'build',
  'ci',
  'dev',
  'install',
  'publish',
  'run',
  'start',
  'test',
];

export const npmProvider: ShellCompletionProvider = {
  command: 'npm',
  async getCompletions(
    tokens: string[],
    cursorIndex: number,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    if (cursorIndex === 1) {
      const partial = tokens[1] || '';
      return {
        suggestions: NPM_SUBCOMMANDS.filter((cmd) =>
          cmd.startsWith(partial),
        ).map((cmd) => ({
          label: cmd,
          value: cmd,
          description: 'npm command',
        })),
        exclusive: true,
      };
    }

    if (cursorIndex === 2 && tokens[1] === 'run') {
      const partial = tokens[2] || '';
      try {
        if (signal?.aborted) return { suggestions: [], exclusive: true };

        const pkgJsonPath = path.join(cwd, 'package.json');
        const content = await fs.readFile(pkgJsonPath, 'utf8');
        const pkg = JSON.parse(content) as unknown;

        const scripts =
          pkg &&
          typeof pkg === 'object' &&
          'scripts' in pkg &&
          pkg.scripts &&
          typeof pkg.scripts === 'object'
            ? Object.keys(pkg.scripts)
            : [];

        return {
          suggestions: scripts
            .filter((s) => s.startsWith(partial))
            .map((s) => ({
              label: s,
              value: escapeShellPath(s),
              description: 'npm script',
            })),
          exclusive: true,
        };
      } catch {
        // No package.json or invalid JSON
        return { suggestions: [], exclusive: true };
      }
    }

    return { suggestions: [], exclusive: false };
  },
};
