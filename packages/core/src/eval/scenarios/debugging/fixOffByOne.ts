/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixOffByOne: EvalScenario = {
  id: 'debug-fix-off-by-one',
  name: 'Fix Off-by-One Error',
  category: 'debugging',
  difficulty: 'easy',
  description:
    'Fix an off-by-one error in a loop that processes array elements.',
  setupFiles: {
    'src/processor.ts': `
export function processItems(items: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i <= items.length; i++) {
    result.push(items[i].toUpperCase());
  }
  return result;
}
`,
  },
  prompt:
    'Fix the off-by-one error in src/processor.ts. The loop goes one past the end of the array.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/processor.ts',
        shouldExist: true,
        contentContains: ['i < items.length'],
        contentNotContains: ['i <= items.length'],
      },
    ],
  },
  tags: ['loop', 'array', 'beginner'],
};
