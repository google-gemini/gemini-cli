/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const findSqlInjection: EvalScenario = {
  id: 'review-find-sql-injection',
  name: 'Find SQL Injection Vulnerability',
  category: 'code-review',
  difficulty: 'medium',
  description:
    'Identify a SQL injection vulnerability in a database query function.',
  setupFiles: {
    'src/db.ts': `
export interface Database {
  query(sql: string): Promise<unknown[]>;
}

export async function findUserByName(db: Database, name: string): Promise<unknown> {
  const sql = \`SELECT * FROM users WHERE name = '\${name}'\`;
  const results = await db.query(sql);
  return results[0] ?? null;
}

export async function findUsersByRole(db: Database, role: string): Promise<unknown[]> {
  const sql = \`SELECT * FROM users WHERE role = '\${role}' ORDER BY name\`;
  return db.query(sql);
}
`,
  },
  prompt:
    'Review src/db.ts for SQL injection vulnerabilities. Fix them using parameterized queries.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/db.ts',
        shouldExist: true,
        contentNotContains: ["'${name}'", "'${role}'"],
      },
    ],
    outputContains: ['SQL injection'],
  },
  tags: ['sql-injection', 'security', 'intermediate'],
};
