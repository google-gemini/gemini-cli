/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getFileDiffFromResultDisplay,
  computeAddedAndRemovedLines,
} from './fileDiffUtils.js';
import type { FileDiff, ToolResultDisplay } from '../tools/tools.js';

describe('fileDiffUtils', () => {
  describe('getFileDiffFromResultDisplay', () => {
    it('returns undefined if resultDisplay is undefined', () => {
      expect(getFileDiffFromResultDisplay(undefined)).toBeUndefined();
    });

    it('returns undefined if resultDisplay is not an object', () => {
      expect(
        getFileDiffFromResultDisplay('string' as ToolResultDisplay),
      ).toBeUndefined();
    });

    it('returns undefined if resultDisplay missing diffStat', () => {
      const resultDisplay = {
        fileName: 'file.txt',
      };
      expect(
        getFileDiffFromResultDisplay(resultDisplay as ToolResultDisplay),
      ).toBeUndefined();
    });

    it('returns the FileDiff object if structure is valid', () => {
      const validDiffStat = {
        model_added_lines: 1,
        model_removed_lines: 2,
        user_added_lines: 3,
        user_removed_lines: 4,
        model_added_chars: 10,
        model_removed_chars: 20,
        user_added_chars: 30,
        user_removed_chars: 40,
      };
      const resultDisplay = {
        fileName: 'file.txt',
        diffStat: validDiffStat,
      };

      const result = getFileDiffFromResultDisplay(
        resultDisplay as ToolResultDisplay,
      );
      expect(result).toBe(resultDisplay);
    });
  });

  describe('computeAddedAndRemovedLines', () => {
    it('returns 0 added and 0 removed if stats is undefined', () => {
      expect(computeAddedAndRemovedLines(undefined)).toEqual({
        addedLines: 0,
        removedLines: 0,
      });
    });

    it('correctly sums added and removed lines from stats', () => {
      const stats: FileDiff['diffStat'] = {
        model_added_lines: 10,
        model_removed_lines: 5,
        user_added_lines: 2,
        user_removed_lines: 1,
        model_added_chars: 100,
        model_removed_chars: 50,
        user_added_chars: 20,
        user_removed_chars: 10,
      };

      const result = computeAddedAndRemovedLines(stats);
      expect(result).toEqual({
        addedLines: 12, // 10 + 2
        removedLines: 6, // 5 + 1
      });
    });

    it('handles zero values correctly', () => {
      const stats: FileDiff['diffStat'] = {
        model_added_lines: 0,
        model_removed_lines: 0,
        user_added_lines: 0,
        user_removed_lines: 0,
        model_added_chars: 0,
        model_removed_chars: 0,
        user_added_chars: 0,
        user_removed_chars: 0,
      };

      const result = computeAddedAndRemovedLines(stats);
      expect(result).toEqual({
        addedLines: 0,
        removedLines: 0,
      });
    });
  });
});
