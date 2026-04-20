/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addMiddleware: EvalScenario = {
  id: 'feature-add-middleware',
  name: 'Add Middleware Pipeline',
  category: 'new-features',
  difficulty: 'hard',
  description: 'Add a middleware pipeline pattern to a request handler.',
  setupFiles: {
    'src/handler.ts': `
export interface Context {
  request: { path: string; headers: Record<string, string> };
  response: { status: number; body: string };
}

export function handleRequest(ctx: Context): void {
  ctx.response.status = 200;
  ctx.response.body = 'Hello, World!';
}
`,
  },
  prompt:
    'Add a middleware pipeline to src/handler.ts. Create a Middleware type (function that takes context and a next function), and a Pipeline class that composes middleware in order.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/handler.ts',
        shouldExist: true,
        contentContains: ['Middleware', 'next', 'Pipeline'],
      },
    ],
  },
  tags: ['middleware', 'pipeline', 'pattern', 'advanced'],
};
