/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addExport: EvalScenario = {
  id: 'feature-add-export',
  name: 'Add CSV Export Functionality',
  category: 'new-features',
  difficulty: 'medium',
  description: 'Add a function to export data as CSV format.',
  setupFiles: {
    'src/data.ts': `
export interface Record {
  id: string;
  name: string;
  email: string;
  score: number;
}

export function getRecords(): Record[] {
  return [
    { id: '1', name: 'Alice', email: 'alice@example.com', score: 95 },
    { id: '2', name: 'Bob', email: 'bob@example.com', score: 87 },
  ];
}
`,
  },
  prompt:
    'Add a CSV export function to src/data.ts that converts records to a CSV string with headers.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/data.ts',
        shouldExist: true,
        contentContains: ['csv', 'export'],
      },
    ],
  },
  tags: ['export', 'csv', 'intermediate'],
};
