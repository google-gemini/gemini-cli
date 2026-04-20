/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixRegex: EvalScenario = {
  id: 'debug-fix-regex',
  name: 'Fix Incorrect Regular Expression',
  category: 'debugging',
  difficulty: 'medium',
  description:
    'Fix a regex that is supposed to validate email addresses but has an incorrect pattern.',
  setupFiles: {
    'src/validator.ts': `
export function isValidEmail(email: string): boolean {
  const pattern = /^[a-zA-Z0-9]+@[a-zA-Z]+$/;
  return pattern.test(email);
}
`,
  },
  prompt:
    'Fix the regex in src/validator.ts. It should accept emails with dots, hyphens, and underscores in the local part, and dots in the domain (e.g., user.name@example.com).',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/validator.ts',
        shouldExist: true,
        contentContains: ['\\.'],
        contentNotContains: ['/^[a-zA-Z0-9]+@[a-zA-Z]+$/'],
      },
    ],
  },
  tags: ['regex', 'validation', 'intermediate'],
};
