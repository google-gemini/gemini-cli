/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const inlineVariable: EvalScenario = {
  id: 'refactor-inline-variable',
  name: 'Inline Unnecessary Variables',
  category: 'refactoring',
  difficulty: 'easy',
  description:
    'Inline temporary variables that are only used once and add no clarity.',
  setupFiles: {
    'src/math.ts': `
export function calculateArea(width: number, height: number): number {
  const w = width;
  const h = height;
  const area = w * h;
  return area;
}

export function calculatePerimeter(width: number, height: number): number {
  const w = width;
  const h = height;
  const perimeter = 2 * (w + h);
  return perimeter;
}
`,
  },
  prompt:
    'Inline the unnecessary temporary variables in src/math.ts that just alias the parameters.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/math.ts',
        shouldExist: true,
        contentNotContains: ['const w = width', 'const h = height'],
      },
    ],
  },
  tags: ['inline', 'simplification', 'beginner'],
};
