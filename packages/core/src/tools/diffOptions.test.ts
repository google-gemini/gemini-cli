/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getDiffStat } from './diffOptions.js';

describe('getDiffStat', () => {
  const fileName = 'test.txt';

  it('should return 0 for all stats when there are no changes', () => {
    const oldStr = 'line1\nline2\n';
    const aiStr = 'line1\nline2\n';
    const userStr = 'line1\nline2\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      model_added_lines: 0,
      model_removed_lines: 0,
      model_added_chars: 0,
      model_removed_chars: 0,
      user_added_lines: 0,
      user_removed_lines: 0,
      user_added_chars: 0,
      user_removed_chars: 0,
    });
  });

  it('should correctly report model additions', () => {
    const oldStr = 'line1\nline2\n';
    const aiStr = 'line1\nline2\nline3\n';
    const userStr = 'line1\nline2\nline3\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      model_added_lines: 1,
      model_removed_lines: 0,
      model_added_chars: 5,
      model_removed_chars: 0,
      user_added_lines: 0,
      user_removed_lines: 0,
      user_added_chars: 0,
      user_removed_chars: 0,
    });
  });

  it('should correctly report model removals', () => {
    const oldStr = 'line1\nline2\nline3\n';
    const aiStr = 'line1\nline3\n';
    const userStr = 'line1\nline3\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      model_added_lines: 0,
      model_removed_lines: 1,
      model_added_chars: 0,
      model_removed_chars: 5,
      user_added_lines: 0,
      user_removed_lines: 0,
      user_added_chars: 0,
      user_removed_chars: 0,
    });
  });

  it('should correctly report model modifications', () => {
    const oldStr = 'line1\nline2\nline3\n';
    const aiStr = 'line1\nline_two\nline3\n';
    const userStr = 'line1\nline_two\nline3\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      model_added_lines: 1,
      model_removed_lines: 1,
      model_added_chars: 8,
      model_removed_chars: 5,
      user_added_lines: 0,
      user_removed_lines: 0,
      user_added_chars: 0,
      user_removed_chars: 0,
    });
  });

  it('should correctly report user additions', () => {
    const oldStr = 'line1\nline2\n';
    const aiStr = 'line1\nline2\nline3\n';
    const userStr = 'line1\nline2\nline3\nline4\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      model_added_lines: 1,
      model_removed_lines: 0,
      model_added_chars: 5,
      model_removed_chars: 0,
      user_added_lines: 1,
      user_removed_lines: 0,
      user_added_chars: 5,
      user_removed_chars: 0,
    });
  });

  it('should correctly report user removals', () => {
    const oldStr = 'line1\nline2\n';
    const aiStr = 'line1\nline2\nline3\n';
    const userStr = 'line1\nline2\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      model_added_lines: 1,
      model_removed_lines: 0,
      model_added_chars: 5,
      model_removed_chars: 0,
      user_added_lines: 0,
      user_removed_lines: 1,
      user_added_chars: 0,
      user_removed_chars: 5,
    });
  });

  it('should correctly report user modifications', () => {
    const oldStr = 'line1\nline2\n';
    const aiStr = 'line1\nline2\nline3\n';
    const userStr = 'line1\nline2\nline_three\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      model_added_lines: 1,
      model_removed_lines: 0,
      model_added_chars: 5,
      model_removed_chars: 0,
      user_added_lines: 1,
      user_removed_lines: 1,
      user_added_chars: 10,
      user_removed_chars: 5,
    });
  });

  it('should handle complex changes from both model and user', () => {
    const oldStr = 'line1\nline2\nline3\nline4\n';
    const aiStr = 'line_one\nline2\nline_three\nline4\n';
    const userStr = 'line_one\nline_two\nline_three\nline4\nline5\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      model_added_lines: 2,
      model_removed_lines: 2,
      model_added_chars: 18,
      model_removed_chars: 10,
      user_added_lines: 2,
      user_removed_lines: 1,
      user_added_chars: 13,
      user_removed_chars: 5,
    });
  });

  it('should report a single line modification as one addition and one removal', () => {
    const oldStr = 'hello world';
    const aiStr = 'hello universe';
    const userStr = 'hello universe';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      model_added_lines: 1,
      model_removed_lines: 1,
      model_added_chars: 14,
      model_removed_chars: 11,
      user_added_lines: 0,
      user_removed_lines: 0,
      user_added_chars: 0,
      user_removed_chars: 0,
    });
  });
});
