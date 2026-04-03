/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';
import type { DiffStat } from './tools.js';

/**
 * Strict interface for Diff Options.
 * Extends the underlying diff library options but enforces Readonly for immutability.
 */
export interface DiffOptions
  extends Readonly<Diff.CreatePatchOptionsNonabortable> {
  /**
   * The number of lines of context to include in the patch.
   * Must be a non-negative integer.
   */
  readonly context?: number;

  /**
   * Whether to ignore whitespace changes.
   */
  readonly ignoreWhitespace?: boolean;
}

/**
 * Validated and normalized options.
 * Guarantees that core properties like context and ignoreWhitespace are set.
 */
export type NormalizedDiffOptions = DiffOptions & {
  readonly context: number;
  readonly ignoreWhitespace: boolean;
};

/**
 * Default options used for diff operations.
 */
export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  context: 3,
  ignoreWhitespace: false,
};

/**
 * Normalizes and validates partial diff options against defaults.
 *
 * @param options - The partial options provided by the user/caller.
 * @returns A fully populated, readonly DiffOptions object.
 * @throws Error if validation fails (e.g. negative context).
 */
export function normalizeDiffOptions(
  options?: Partial<DiffOptions>,
): NormalizedDiffOptions {
  const context = options?.context ?? DEFAULT_DIFF_OPTIONS.context ?? 3;
  const ignoreWhitespace = !!(
    options?.ignoreWhitespace ??
    DEFAULT_DIFF_OPTIONS.ignoreWhitespace ??
    false
  );

  const merged: NormalizedDiffOptions = {
    ...options,
    context,
    ignoreWhitespace,
  };

  // Runtime Validation
  if (merged.context < 0) {
    throw new Error(
      `Diff context must be non-negative. Received: ${merged.context}`,
    );
  }

  return Object.freeze(merged);
}

/**
 * Calculates statistics about the differences between strings.
 *
 * @param fileName - The name of the file being diffed.
 * @param oldStr - The original content.
 * @param aiStr - The content proposed by the AI.
 * @param userStr - The content as modified by the user (or the same as aiStr).
 * @param options - Optional DiffOptions to control the diff algorithm.
 * @returns DiffStat object with added/removed lines and chars.
 */
export function getDiffStat(
  fileName: string,
  oldStr: string,
  aiStr: string,
  userStr: string,
  options?: DiffOptions,
): DiffStat {
  const normalizedOpts = normalizeDiffOptions(options);

  // Adapt to StructuredPatchOptions
  // structuredPatch expects context and ignoreWhitespace.
  const patchOpts: Diff.StructuredPatchOptionsNonabortable = {
    context: normalizedOpts.context,
    ignoreWhitespace: normalizedOpts.ignoreWhitespace,
  };

  const getStats = (patch: Diff.StructuredPatch) => {
    let addedLines = 0;
    let removedLines = 0;
    let addedChars = 0;
    let removedChars = 0;

    patch.hunks.forEach((hunk: Diff.StructuredPatchHunk) => {
      hunk.lines.forEach((line: string) => {
        if (line.startsWith('+')) {
          addedLines++;
          addedChars += line.length - 1;
        } else if (line.startsWith('-')) {
          removedLines++;
          removedChars += line.length - 1;
        }
      });
    });
    return { addedLines, removedLines, addedChars, removedChars };
  };

  const modelPatch = Diff.structuredPatch(
    fileName,
    fileName,
    oldStr,
    aiStr,
    'Current',
    'Proposed',
    patchOpts,
  );
  const modelStats = getStats(modelPatch);

  const userPatch = Diff.structuredPatch(
    fileName,
    fileName,
    aiStr,
    userStr,
    'Proposed',
    'User',
    patchOpts,
  );
  const userStats = getStats(userPatch);

  return {
    model_added_lines: modelStats.addedLines,
    model_removed_lines: modelStats.removedLines,
    model_added_chars: modelStats.addedChars,
    model_removed_chars: modelStats.removedChars,
    user_added_lines: userStats.addedLines,
    user_removed_lines: userStats.removedLines,
    user_added_chars: userStats.addedChars,
    user_removed_chars: userStats.removedChars,
  };
}

/**
 * Extracts line and character stats from a unified diff patch string.
 * This is useful for reconstructing stats for rejected or errored operations
 * where the full strings may no longer be easily accessible.
 */
export function getDiffStatFromPatch(patch: string): DiffStat {
  let addedLines = 0;
  let removedLines = 0;
  let addedChars = 0;
  let removedChars = 0;

  const lines = patch.split('\n');
  for (const line of lines) {
    // Only count lines that are additions or removals,
    // excluding the diff headers (--- and +++) and metadata (\)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines++;
      addedChars += line.length - 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removedLines++;
      removedChars += line.length - 1;
    }
  }

  return {
    model_added_lines: addedLines,
    model_removed_lines: removedLines,
    model_added_chars: addedChars,
    model_removed_chars: removedChars,
    user_added_lines: 0,
    user_removed_lines: 0,
    user_added_chars: 0,
    user_removed_chars: 0,
  };
}
