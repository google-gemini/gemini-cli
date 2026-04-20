/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixTypeError: EvalScenario = {
  id: 'debug-fix-type-error',
  name: 'Fix Type Mismatch Error',
  category: 'debugging',
  difficulty: 'easy',
  description:
    'Fix a function that returns a number where a string is expected.',
  setupFiles: {
    'src/formatter.ts': `
export function formatPrice(amount: number): string {
  return amount * 100;
}
`,
  },
  prompt:
    'Fix the type error in src/formatter.ts. The function should return a string but returns a number.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/formatter.ts',
        shouldExist: true,
        contentContains: ['string'],
        contentNotContains: ['return amount * 100;'],
      },
    ],
  },
  tags: ['types', 'typescript', 'beginner'],
};
