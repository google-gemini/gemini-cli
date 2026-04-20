/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addRateLimit: EvalScenario = {
  id: 'feature-add-rate-limit',
  name: 'Add Rate Limiting',
  category: 'new-features',
  difficulty: 'hard',
  description: 'Add a token bucket rate limiter to control request throughput.',
  setupFiles: {
    'src/server.ts': `
export interface Request {
  ip: string;
  path: string;
  timestamp: number;
}

export interface Response {
  status: number;
  body: string;
}

export function handleRequest(req: Request): Response {
  return { status: 200, body: 'OK' };
}
`,
  },
  prompt:
    'Add a rate limiter to src/server.ts using a token bucket algorithm. Limit each IP to 100 requests per minute. Return 429 when rate limited.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/server.ts',
        shouldExist: true,
        contentContains: ['rate', '429', 'token'],
      },
    ],
  },
  tags: ['rate-limit', 'token-bucket', 'advanced'],
};
