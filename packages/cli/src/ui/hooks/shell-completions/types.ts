/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Suggestion } from '../../components/SuggestionsDisplay.js';

export interface CompletionResult {
  suggestions: Suggestion[];
  // If true, this prevents the shell from appending generic file/path completions
  // to this list. Use this when the tool expects ONLY specific values (e.g. branches).
  exclusive?: boolean;
}

export interface ShellCompletionProvider {
  command: string; // The command trigger, e.g., 'git' or 'npm'
  getCompletions(
    tokens: string[], // List of arguments parsed from the input
    cursorIndex: number, // Which token index the cursor is currently on
    cwd: string,
    signal?: AbortSignal,
  ): Promise<CompletionResult>;
}
