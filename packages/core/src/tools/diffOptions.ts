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
<<<<<<< HEAD
    let added_lines = 0;
    let removed_lines = 0;
    let added_chars = 0;
    let removed_chars = 0;
=======
    let addedLines = 0;
    let removedLines = 0;
    let addedChars = 0;
    let removedChars = 0;
>>>>>>> aff3525c (feat(telemetry): Add character counts to diff stats)

    patch.hunks.forEach((hunk: Diff.Hunk) => {
      hunk.lines.forEach((line: string) => {
        if (line.startsWith('+')) {
<<<<<<< HEAD
          added_lines++;
          added_chars += line.length - 1;
        } else if (line.startsWith('-')) {
          removed_lines++;
          removed_chars += line.length - 1;
        }
      });
    });

    return { added_lines, removed_lines, added_chars, removed_chars };
=======
          addedLines++;
          addedChars += line.length - 1;
        } else if (line.startsWith('-')) {
          removedLines++;
          removedChars += line.length - 1;
        }
      });
    });
    return { addedLines, removedLines, addedChars, removedChars };
>>>>>>> aff3525c (feat(telemetry): Add character counts to diff stats)
  };

  const aiPatch = Diff.structuredPatch(
    fileName,
    fileName,
    oldStr,
    aiStr,
    'Current',
    'Proposed',
    DEFAULT_DIFF_OPTIONS,
  );
  const modelStats = getStats(aiPatch);

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

  return {
<<<<<<< HEAD
    ai_added_lines: modelStats.added_lines,
    ai_removed_lines: modelStats.removed_lines,
    model_added_chars: modelStats.added_chars,
    model_removed_chars: modelStats.removed_chars,
    user_added_lines: userStats.added_lines,
    user_removed_lines: userStats.removed_lines,
    user_added_chars: userStats.added_chars,
    user_removed_chars: userStats.removed_chars,
=======
    ai_added_lines: modelStats.addedLines,
    ai_removed_lines: modelStats.removedLines,
    model_added_chars: modelStats.addedChars,
    model_removed_chars: modelStats.removedChars,
    user_added_lines: userStats.addedLines,
    user_removed_lines: userStats.removedLines,
    user_added_chars: userStats.addedChars,
    user_removed_chars: userStats.removedChars,
>>>>>>> aff3525c (feat(telemetry): Add character counts to diff stats)
  };
}
