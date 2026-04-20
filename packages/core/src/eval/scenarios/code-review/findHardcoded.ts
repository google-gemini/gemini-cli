/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const findHardcoded: EvalScenario = {
  id: 'review-find-hardcoded',
  name: 'Find Hardcoded Credentials',
  category: 'code-review',
  difficulty: 'easy',
  description: 'Identify hardcoded credentials and secrets in source code.',
  setupFiles: {
    'src/config.ts': `
export const DB_HOST = 'prod-db.example.com';
export const DB_PORT = 5432;
export const DB_USER = 'admin';
export const DB_PASSWORD = 'supersecret123!';
export const API_KEY = 'sk-1234567890abcdef';

export function getDbConnectionString(): string {
  return \`postgres://\${DB_USER}:\${DB_PASSWORD}@\${DB_HOST}:\${DB_PORT}/myapp\`;
}
`,
  },
  prompt:
    'Review src/config.ts for hardcoded secrets. Refactor to use environment variables instead.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/config.ts',
        shouldExist: true,
        contentContains: ['process.env'],
        contentNotContains: ['supersecret123!', 'sk-1234567890abcdef'],
      },
    ],
    outputContains: ['hardcoded'],
  },
  tags: ['secrets', 'credentials', 'security', 'beginner'],
};
