/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixInfiniteLoop: EvalScenario = {
  id: 'debug-fix-infinite-loop',
  name: 'Fix Infinite Loop',
  category: 'debugging',
  difficulty: 'medium',
  description:
    'Fix a while loop that never terminates because the loop variable is not incremented.',
  setupFiles: {
    'src/search.ts': `
export function findIndex(items: number[], target: number): number {
  let i = 0;
  while (i < items.length) {
    if (items[i] === target) {
      return i;
    }
    // Missing increment
  }
  return -1;
}
`,
  },
  prompt:
    'Fix the infinite loop in src/search.ts. The loop variable i is never incremented.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/search.ts',
        shouldExist: true,
        contentContains: ['i++'],
      },
    ],
  },
  tags: ['loop', 'infinite-loop', 'intermediate'],
};
