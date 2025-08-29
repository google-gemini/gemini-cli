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
      ai_added_lines: 0,
      ai_removed_lines: 0,
      user_added_lines: 0,
      user_removed_lines: 0,
    });
  });

  it('should correctly report AI additions', () => {
    const oldStr = 'line1\nline2\n';
    const aiStr = 'line1\nline2\nline3\n';
    const userStr = 'line1\nline2\nline3\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      ai_added_lines: 1,
      ai_removed_lines: 0,
      user_added_lines: 0,
      user_removed_lines: 0,
    });
  });

  it('should correctly report AI removals', () => {
    const oldStr = 'line1\nline2\nline3\n';
    const aiStr = 'line1\nline3\n';
    const userStr = 'line1\nline3\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      ai_added_lines: 0,
      ai_removed_lines: 1,
      user_added_lines: 0,
      user_removed_lines: 0,
    });
  });

  it('should correctly report AI modifications', () => {
    const oldStr = 'line1\nline2\nline3\n';
    const aiStr = 'line1\nline_two\nline3\n';
    const userStr = 'line1\nline_two\nline3\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      ai_added_lines: 1,
      ai_removed_lines: 1,
      user_added_lines: 0,
      user_removed_lines: 0,
    });
  });

  it('should correctly report user additions', () => {
    const oldStr = 'line1\nline2\n';
    const aiStr = 'line1\nline2\nline3\n';
    const userStr = 'line1\nline2\nline3\nline4\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      ai_added_lines: 1,
      ai_removed_lines: 0,
      user_added_lines: 1,
      user_removed_lines: 0,
    });
  });

  it('should correctly report user removals', () => {
    const oldStr = 'line1\nline2\n';
    const aiStr = 'line1\nline2\nline3\n';
    const userStr = 'line1\nline2\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      ai_added_lines: 1,
      ai_removed_lines: 0,
      user_added_lines: 0,
      user_removed_lines: 1,
    });
  });

  it('should correctly report user modifications', () => {
    const oldStr = 'line1\nline2\n';
    const aiStr = 'line1\nline2\nline3\n';
    const userStr = 'line1\nline2\nline_three\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      ai_added_lines: 1,
      ai_removed_lines: 0,
      user_added_lines: 1,
      user_removed_lines: 1,
    });
  });

  it('should handle complex changes from both AI and user', () => {
    const oldStr = 'line1\nline2\nline3\nline4\n';
    const aiStr = 'line_one\nline2\nline_three\nline4\n';
    const userStr = 'line_one\nline_two\nline_three\nline4\nline5\n';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      ai_added_lines: 2,
      ai_removed_lines: 2,
      user_added_lines: 2,
      user_removed_lines: 1,
    });
  });

  it('should report a single line modification as one addition and one removal', () => {
    const oldStr = 'hello world';
    const aiStr = 'hello universe';
    const userStr = 'hello universe';
    const diffStat = getDiffStat(fileName, oldStr, aiStr, userStr);
    expect(diffStat).toEqual({
      ai_added_lines: 1,
      ai_removed_lines: 1,
      user_added_lines: 0,
      user_removed_lines: 0,
    });
  });
});
