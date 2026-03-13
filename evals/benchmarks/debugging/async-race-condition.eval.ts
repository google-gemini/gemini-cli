/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/async-race-condition', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should fix a race condition caused by two async writes to shared state',
    category: 'debugging',
    tags: ['async', 'concurrency', 'typescript'],
    files: {
      'src/counter.ts': `// BUG: concurrent increments lose updates due to read-modify-write race
let counter = 0;

export async function incrementAsync(): Promise<void> {
  const current = counter;
  await new Promise((r) => setTimeout(r, 0)); // simulate async work
  counter = current + 1;
}

export function getCounter() {
  return counter;
}
`,
    },
    prompt:
      'src/counter.ts has a race condition: when incrementAsync is called concurrently, updates are lost because both reads happen before either write. Fix the race condition so concurrent calls each increment the counter exactly once.',
    assert: async (rig) => {
      const content = rig.readFile('src/counter.ts');
      const hasProtection =
        content.includes('++') ||
        content.includes('queue') ||
        content.includes('lock') ||
        content.includes('mutex') ||
        content.includes('Promise.all') ||
        content.includes('sequential') ||
        content.includes('counter +');
      expect(
        hasProtection,
        'Expected race condition fix (atomic increment or serialization)',
      ).toBe(true);
    },
  });
});
