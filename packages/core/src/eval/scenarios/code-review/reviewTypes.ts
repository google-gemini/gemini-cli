/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const reviewTypes: EvalScenario = {
  id: 'review-review-types',
  name: 'Review Type Safety Issues',
  category: 'code-review',
  difficulty: 'medium',
  description:
    'Identify type safety issues including excessive use of any and unsafe casts.',
  setupFiles: {
    'src/transform.ts': `
export function transformData(input: any): any {
  const items = input.data as any[];
  const result: any = {};
  for (const item of items) {
    result[item.id] = {
      name: item.name as string,
      value: item.value as any,
      meta: item.meta || {},
    };
  }
  return result;
}

export function mergeConfigs(a: any, b: any): any {
  return { ...a, ...b };
}
`,
  },
  prompt:
    'Review src/transform.ts for type safety issues. Replace all uses of "any" with proper TypeScript types and interfaces.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/transform.ts',
        shouldExist: true,
        contentContains: ['interface'],
        contentNotContains: [': any'],
      },
    ],
  },
  tags: ['types', 'type-safety', 'typescript', 'intermediate'],
};
