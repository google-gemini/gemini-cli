/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';
import { DiffStat } from './tools.js';

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
  let aiAddedLines = 0;
  let aiRemovedLines = 0;
  let userAddedLines = 0;
  let userDeletedLines = 0;

  const patch = Diff.structuredPatch(
    fileName,
    fileName,
    oldStr,
    aiStr,
    'Current',
    'Proposed',
    DEFAULT_DIFF_OPTIONS,
  );
  patch.hunks.forEach((hunk: Diff.Hunk) => {
    hunk.lines.forEach((line: string) => {
      if (line.startsWith('+')) {
        aiAddedLines++;
      } else if (line.startsWith('-')) {
        aiRemovedLines++;
      }
    });
  });
  const userPatch = Diff.structuredPatch(
    fileName,
    fileName,
    aiStr,
    userStr,
    'Proposed',
    'User',
    DEFAULT_DIFF_OPTIONS,
  );
  userPatch.hunks.forEach((hunk: Diff.Hunk) => {
    hunk.lines.forEach((line: string) => {
      if (line.startsWith('+')) {
        userAddedLines++;
      } else if (line.startsWith('-')) {
        userDeletedLines++;
      }
    });
  });
  return {
    ai_added_lines: aiAddedLines,
    ai_removed_lines: aiRemovedLines,
    user_added_lines: userAddedLines,
    user_removed_lines: userDeletedLines,
  };
}
