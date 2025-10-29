/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';
import type { DiffStat } from './tools.js';

export const DEFAULT_DIFF_OPTIONS: Diff.PatchOptions = {
  context: 3,
  ignoreWhitespace: true,
};

export function getDiffStat(
  fileName: string,
  oldStr: string,
  aiStr: string,
  userStr: string,
): DiffStat {
  const getStats = (patch: Diff.ParsedDiff) => {
    let addedLines = 0;
    let removedLines = 0;
    let addedChars = 0;
    let removedChars = 0;

    patch.hunks.forEach((hunk: Diff.Hunk) => {
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

  const suggestedPatch = Diff.structuredPatch(
    fileName,
    fileName,
    oldStr,
    aiStr,
    'Current',
    'Proposed',
    DEFAULT_DIFF_OPTIONS,
  );
  const suggestedStats = getStats(suggestedPatch);

  const userPatch = Diff.structuredPatch(
    fileName,
    fileName,
    aiStr,
    userStr,
    'Proposed',
    'User',
    DEFAULT_DIFF_OPTIONS,
  );
  const userStats = getStats(userPatch);

  const acceptedPatch = Diff.structuredPatch(
    fileName,
    fileName,
    oldStr,
    userStr,
    'Current',
    'User',
    DEFAULT_DIFF_OPTIONS,
  );
  const acceptedStats = getStats(acceptedPatch);

  console.log(`model accepted ${acceptedStats.addedLines}`);
  console.log(`model removed ${acceptedStats.removedLines}`);
  console.log(`suggested accepted ${suggestedStats.addedLines}`);
  console.log(`suggested removed ${suggestedStats.removedLines}`);

  return {
    model_added_lines: acceptedStats.addedLines,
    model_removed_lines: acceptedStats.removedLines,
    model_added_chars: acceptedStats.addedChars,
    model_removed_chars: acceptedStats.removedChars,
    user_added_lines: userStats.addedLines,
    user_removed_lines: userStats.removedLines,
    user_added_chars: userStats.addedChars,
    user_removed_chars: userStats.removedChars,
    suggested_added_lines: suggestedStats.addedLines,
    suggested_removed_lines: suggestedStats.removedLines,
  };
}
