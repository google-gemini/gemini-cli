/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ShellCompletionProvider, CompletionResult } from './types.js';
import type { Suggestion } from '../../components/SuggestionsDisplay.js';

export const visualizeProvider: ShellCompletionProvider = {
  command: 'visualize',

  async getCompletions(
    tokens: string[],
    cursorIndex: number,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<CompletionResult> {
    const partial = tokens[cursorIndex] ?? '';

    const lastSlash = partial.lastIndexOf('/');
    const dirPart = lastSlash === -1 ? '' : partial.substring(0, lastSlash + 1);
    const filePart =
      lastSlash === -1 ? partial : partial.substring(lastSlash + 1);
    const baseDir = resolve(cwd, dirPart || '.');

    try {
      const entries = await readdir(baseDir, { withFileTypes: true });

      if (signal?.aborted) return { suggestions: [] };

      const suggestions: Suggestion[] = entries
        .filter(
          (e) =>
            e.isDirectory() &&
            !e.name.startsWith('.') &&
            e.name.startsWith(filePart),
        )
        .map((e) => ({
          label: `${dirPart}${e.name}`,
          value: `${dirPart}${e.name}`,
        }));

      return { suggestions };
    } catch {
      return { suggestions: [] };
    }
  },
};
