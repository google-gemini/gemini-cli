/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/off-by-one', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should fix an off-by-one error accessing the last array element',
    category: 'debugging',
    tags: ['javascript', 'arrays'],
    files: {
      'src/list.ts': `// BUG: array[array.length] is always undefined
export function getLast<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[items.length]; // off-by-one: should be length - 1
}
`,
    },
    prompt:
      'src/list.ts has an off-by-one bug in getLast. It returns undefined for non-empty arrays because it accesses index items.length instead of items.length - 1. Fix it.',
    assert: async (rig) => {
      const content = rig.readFile('src/list.ts');
      const hasCorrectIndex =
        content.includes('length - 1') ||
        content.includes('.at(-1)') ||
        content.includes('slice(-1)');
      expect(
        hasCorrectIndex,
        'Expected corrected index (length - 1 or .at(-1))',
      ).toBe(true);
      expect(content).not.toMatch(/items\[items\.length\][^-]/);
    },
  });
});
