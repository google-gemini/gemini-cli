/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const renameVariable: EvalScenario = {
  id: 'refactor-rename-variable',
  name: 'Rename Poorly Named Variables',
  category: 'refactoring',
  difficulty: 'easy',
  description: 'Rename cryptic single-letter variables to descriptive names.',
  setupFiles: {
    'src/calc.ts': `
export function calc(a: number[], b: number): number {
  let c = 0;
  for (const d of a) {
    if (d > b) {
      c += d;
    }
  }
  return c;
}
`,
  },
  prompt:
    'Rename the poorly named variables in src/calc.ts to be more descriptive. The function sums all array values that exceed a threshold.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/calc.ts',
        shouldExist: true,
        contentNotContains: ['(a: number[], b: number)'],
      },
    ],
  },
  tags: ['naming', 'readability', 'beginner'],
};
