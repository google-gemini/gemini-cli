/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addValidation: EvalScenario = {
  id: 'feature-add-validation',
  name: 'Add Input Validation',
  category: 'new-features',
  difficulty: 'easy',
  description:
    'Add input validation to a function that currently accepts any input without checking.',
  setupFiles: {
    'src/user.ts': `
export interface CreateUserInput {
  name: string;
  email: string;
  age: number;
}

export function createUser(input: CreateUserInput) {
  return {
    id: Math.random().toString(36).slice(2),
    ...input,
    createdAt: new Date(),
  };
}
`,
  },
  prompt:
    'Add input validation to createUser in src/user.ts: name must be non-empty, email must contain @, age must be between 0 and 150. Throw descriptive errors.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/user.ts',
        shouldExist: true,
        contentContains: ['throw', '@', 'age'],
      },
    ],
  },
  tags: ['validation', 'input', 'beginner'],
};
