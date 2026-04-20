/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const extractFunction: EvalScenario = {
  id: 'refactor-extract-function',
  name: 'Extract Repeated Logic into Function',
  category: 'refactoring',
  difficulty: 'easy',
  description:
    'Extract duplicated validation logic into a reusable helper function.',
  setupFiles: {
    'src/api.ts': `
export function createUser(name: string, email: string) {
  if (!name || name.trim().length === 0) {
    throw new Error('Name is required');
  }
  if (!email || email.trim().length === 0) {
    throw new Error('Email is required');
  }
  return { name: name.trim(), email: email.trim() };
}

export function updateUser(name: string, email: string) {
  if (!name || name.trim().length === 0) {
    throw new Error('Name is required');
  }
  if (!email || email.trim().length === 0) {
    throw new Error('Email is required');
  }
  return { name: name.trim(), email: email.trim(), updated: true };
}
`,
  },
  prompt:
    'Refactor src/api.ts to extract the duplicated validation logic into a shared helper function.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/api.ts',
        shouldExist: true,
        contentContains: ['function'],
      },
    ],
  },
  tags: ['extract-function', 'duplication', 'beginner'],
};
