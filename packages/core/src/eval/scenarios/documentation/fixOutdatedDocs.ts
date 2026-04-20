/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixOutdatedDocs: EvalScenario = {
  id: 'docs-fix-outdated-docs',
  name: 'Fix Outdated Documentation',
  category: 'documentation',
  difficulty: 'medium',
  description:
    'Update JSDoc comments that no longer match the actual function signatures.',
  setupFiles: {
    'src/api.ts': `
/**
 * Fetches a user by ID.
 * @param id - The user ID (number).
 * @returns The user object.
 */
export async function getUser(id: string, includeProfile: boolean = false): Promise<{ id: string; name: string; profile?: object }> {
  return { id, name: 'Test User', profile: includeProfile ? {} : undefined };
}

/**
 * Deletes a user.
 * @param id - The user ID.
 * @returns void
 */
export async function removeUser(id: string): Promise<boolean> {
  return true;
}
`,
  },
  prompt:
    'Fix the outdated JSDoc comments in src/api.ts. The parameter types, names, and return types in the docs do not match the actual function signatures.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/api.ts',
        shouldExist: true,
        contentContains: ['string', 'includeProfile', 'boolean'],
        contentNotContains: ['@param id - The user ID (number).'],
      },
    ],
  },
  tags: ['jsdoc', 'outdated', 'intermediate'],
};
