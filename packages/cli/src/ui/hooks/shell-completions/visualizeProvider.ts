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
    const base = resolve(cwd, partial || '.');
    const prefix = partial.endsWith('/')
      ? partial
      : partial.split('/').slice(0, -1).join('/');

    try {
      const entries = await readdir(base, { withFileTypes: true });

      if (signal?.aborted) return { suggestions: [] };

      const suggestions: Suggestion[] = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => ({
          label: prefix ? `${prefix}/${e.name}` : e.name,
          value: prefix ? `${prefix}/${e.name}` : e.name,
        }));

      return { suggestions };
    } catch {
      return { suggestions: [] };
    }
  },
};
