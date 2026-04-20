/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const reviewErrorMessages: EvalScenario = {
  id: 'review-error-messages',
  name: 'Review Error Messages Quality',
  category: 'code-review',
  difficulty: 'easy',
  description:
    'Review and improve vague, unhelpful error messages to include context and actionable information.',
  setupFiles: {
    'src/validator.ts': `
export function validateConfig(config: Record<string, unknown>): void {
  if (!config.port) {
    throw new Error('Invalid config');
  }
  if (typeof config.port !== 'number') {
    throw new Error('Bad value');
  }
  if ((config.port as number) < 0 || (config.port as number) > 65535) {
    throw new Error('Error');
  }
  if (!config.host) {
    throw new Error('Missing field');
  }
  if (typeof config.host !== 'string') {
    throw new Error('Wrong type');
  }
}
`,
  },
  prompt:
    'Review src/validator.ts and improve the error messages. Each error should clearly state what went wrong, what field is affected, and what the valid values are.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/validator.ts',
        shouldExist: true,
        contentNotContains: [
          "'Invalid config'",
          "'Bad value'",
          "'Error'",
          "'Missing field'",
          "'Wrong type'",
        ],
      },
    ],
  },
  tags: ['error-messages', 'ux', 'beginner'],
};
