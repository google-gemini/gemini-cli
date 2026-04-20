/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addRetry: EvalScenario = {
  id: 'feature-add-retry',
  name: 'Add Retry Logic with Exponential Backoff',
  category: 'new-features',
  difficulty: 'medium',
  description:
    'Add a retry wrapper with exponential backoff for flaky network calls.',
  setupFiles: {
    'src/api.ts': `
export async function fetchUserData(userId: string): Promise<{ name: string }> {
  const response = await fetch(\`https://api.example.com/users/\${userId}\`);
  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}\`);
  }
  return response.json();
}
`,
  },
  prompt:
    'Add a retry utility to src/api.ts that wraps fetchUserData with exponential backoff (max 3 retries, starting at 1s delay).',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/api.ts',
        shouldExist: true,
        contentContains: ['retry', 'backoff'],
      },
    ],
  },
  tags: ['retry', 'backoff', 'network', 'intermediate'],
};
