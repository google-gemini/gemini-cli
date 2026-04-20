/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixNullPointer: EvalScenario = {
  id: 'debug-fix-null-pointer',
  name: 'Fix Null Pointer Dereference',
  category: 'debugging',
  difficulty: 'easy',
  description:
    'Fix a null pointer dereference when accessing a property on an optional object.',
  setupFiles: {
    'src/user.ts': `
export interface User {
  name: string;
  address?: { city: string; zip: string };
}

export function getUserCity(user: User): string {
  return user.address.city;
}
`,
  },
  prompt:
    'Fix the null pointer error in src/user.ts. The address property is optional but accessed without a null check.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/user.ts',
        shouldExist: true,
        contentContains: ['address'],
        contentNotContains: ['return user.address.city;'],
      },
    ],
  },
  tags: ['null-check', 'typescript', 'beginner'],
};
