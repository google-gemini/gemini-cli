/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FileDiff } from '../tools/tools.js';
import type { ToolCallRecord } from '../services/chatRecordingService.js';

/**
 * Safely extracts the FileDiff object from a tool call's resultDisplay.
 * This helper performs runtime checks to ensure the object conforms to the FileDiff structure.
 * @param resultDisplay The resultDisplay property of a ToolCallRecord.
 * @returns The FileDiff object if found and valid, otherwise undefined.
 */
export function getFileDiffFromResultDisplay(
  resultDisplay: ToolCallRecord['resultDisplay'],
): FileDiff | undefined {
  if (
    resultDisplay &&
    typeof resultDisplay === 'object' &&
    'diffStat' in resultDisplay &&
    typeof resultDisplay.diffStat === 'object' &&
    resultDisplay.diffStat !== null
  ) {
    const diffStat = resultDisplay.diffStat as FileDiff['diffStat'];
    if (diffStat) {
      return resultDisplay;
    }
  }
  return undefined;
}

export function computeAddedAndRemovedLines(
  stats: FileDiff['diffStat'] | undefined,
): {
  addedLines: number;
  removedLines: number;
} {
  if (!stats) {
    return {
      addedLines: 0,
      removedLines: 0,
    };
  }
  return {
    addedLines: stats.model_added_lines + stats.user_added_lines,
    removedLines: stats.model_removed_lines + stats.user_removed_lines,
  };
}
