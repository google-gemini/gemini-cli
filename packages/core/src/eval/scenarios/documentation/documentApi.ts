/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const documentApi: EvalScenario = {
  id: 'docs-document-api',
  name: 'Document REST API Endpoints',
  category: 'documentation',
  difficulty: 'hard',
  description:
    'Generate API documentation for REST endpoint handlers including request/response schemas.',
  setupFiles: {
    'src/routes.ts': `
export interface Request {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}

export interface Response {
  status(code: number): Response;
  json(data: unknown): void;
}

export function listUsers(req: Request, res: Response): void {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  res.status(200).json({ users: [], page, limit, total: 0 });
}

export function getUser(req: Request, res: Response): void {
  const { id } = req.params;
  res.status(200).json({ id, name: 'User', email: 'user@example.com' });
}

export function createUser(req: Request, res: Response): void {
  const { name, email } = req.body as { name: string; email: string };
  res.status(201).json({ id: '123', name, email });
}

export function deleteUser(req: Request, res: Response): void {
  res.status(204).json({});
}
`,
  },
  prompt:
    'Generate API documentation for the REST endpoints in src/routes.ts. Create a docs/api.md file with endpoint descriptions, parameters, request/response schemas, and status codes.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'docs/api.md',
        shouldExist: true,
        contentContains: ['GET', 'POST', 'DELETE', 'listUsers', 'createUser'],
      },
    ],
  },
  tags: ['api', 'rest', 'documentation', 'advanced'],
};
