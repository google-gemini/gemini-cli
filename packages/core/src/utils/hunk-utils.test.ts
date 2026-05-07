/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseHunks, applySelectedHunks } from './hunk-utils.js';
import * as Diff from 'diff';

describe('hunk-utils', () => {
  const original = `Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10
Line 11
Line 12
Line 13
Line 14
Line 15
Line 16
Line 17
Line 18
Line 19
Line 20`;

  const modified = `Line 1
Changed 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10
Line 11
Line 12
Line 13
Line 14
Line 15
Line 16
Line 17
Changed 18
Line 19
Line 20`;

  const diffContent = Diff.createPatch(
    'test.txt',
    original,
    modified,
    'Current',
    'Proposed',
    { context: 3 },
  );

  it('should parse hunks correctly', () => {
    const hunks = parseHunks(diffContent);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].diff).toContain('-Line 2');
    expect(hunks[0].diff).toContain('+Changed 2');
    expect(hunks[1].diff).toContain('-Line 18');
    expect(hunks[1].diff).toContain('+Changed 18');
  });

  it('should apply all selected hunks', () => {
    const result = applySelectedHunks(original, diffContent, [0, 1]);
    expect(result).toBe(modified);
  });

  it('should apply only the first hunk', () => {
    const result = applySelectedHunks(original, diffContent, [0]);
    const expected = `Line 1
Changed 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10
Line 11
Line 12
Line 13
Line 14
Line 15
Line 16
Line 17
Line 18
Line 19
Line 20`;
    expect(result).toBe(expected);
  });

  it('should apply only the second hunk', () => {
    const result = applySelectedHunks(original, diffContent, [1]);
    const expected = `Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10
Line 11
Line 12
Line 13
Line 14
Line 15
Line 16
Line 17
Changed 18
Line 19
Line 20`;
    expect(result).toBe(expected);
  });

  it('should return original if no hunks selected', () => {
    const result = applySelectedHunks(original, diffContent, []);
    expect(result).toBe(original);
  });
});
