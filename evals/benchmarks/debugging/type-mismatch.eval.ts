/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/type-mismatch', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should fix a type mismatch where a string is passed where a number is expected',
    category: 'debugging',
    tags: ['typescript', 'types'],
    files: {
      'src/math.ts': `// BUG: price is coming in as string from query param, but used as number
export function applyDiscount(price: string, discountPercent: number): number {
  return price - (price * discountPercent) / 100;
}
`,
    },
    prompt:
      'src/math.ts has a type bug: applyDiscount receives price as a string but performs arithmetic on it. In JavaScript this produces NaN for non-numeric strings. Fix the function to correctly convert and validate the price before computing the discount.',
    assert: async (rig) => {
      const content = rig.readFile('src/math.ts');
      const hasConversion =
        content.includes('Number(') ||
        content.includes('parseFloat(') ||
        content.includes('parseInt(') ||
        content.includes(': number') ||
        content.includes('isNaN');
      expect(
        hasConversion,
        'Expected numeric conversion or type correction in fixed code',
      ).toBe(true);
    },
  });
});
