/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';
import type { DiffStat } from './tools.js';

const DEFAULT_STRUCTURED_PATCH_OPTS: Diff.StructuredPatchOptionsNonabortable = {
  context: 3,
  ignoreWhitespace: false,
};

export const DEFAULT_DIFF_OPTIONS: Diff.CreatePatchOptionsNonabortable = {
  context: 3,
  ignoreWhitespace: false,
};

export function getDiffStat(
  fileName: string,
  oldStr: string,
  aiStr: string,
  userStr: string,
): DiffStat {
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
    DEFAULT_STRUCTURED_PATCH_OPTS,
  );
  const modelStats = getStats(modelPatch);

  const userPatch = Diff.structuredPatch(
    fileName,
    fileName,
    aiStr,
    userStr,
    'Proposed',
    'User',
    DEFAULT_STRUCTURED_PATCH_OPTS,
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
