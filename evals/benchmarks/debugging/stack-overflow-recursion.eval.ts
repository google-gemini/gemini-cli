/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/stack-overflow-recursion', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should add a base case to a recursive function missing one',
    category: 'debugging',
    tags: ['recursion', 'typescript', 'algorithms'],
    files: {
      'src/factorial.ts': `// BUG: missing base case — factorial(0) recurses forever causing a stack overflow
export function factorial(n: number): number {
  return n * factorial(n - 1); // no base case!
}
`,
    },
    prompt:
      'src/factorial.ts is missing a base case. factorial(0) will recurse forever and crash with a stack overflow. Add the correct base case (factorial(0) = 1) and also guard against negative inputs.',
    assert: async (rig) => {
      const content = rig.readFile('src/factorial.ts');
      const hasBaseCase =
        content.includes('=== 0') ||
        content.includes('=== 1') ||
        content.includes('<= 0') ||
        content.includes('<= 1') ||
        content.includes('n === 0') ||
        content.includes('n < 2');
      expect(hasBaseCase, 'Expected a base case condition').toBe(true);
      expect(content).toContain('return');
    },
  });
});
