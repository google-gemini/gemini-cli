/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addFilter: EvalScenario = {
  id: 'feature-add-filter',
  name: 'Add Filtering Support',
  category: 'new-features',
  difficulty: 'easy',
  description: 'Add filtering by status and date range to a query function.',
  setupFiles: {
    'src/tasks.ts': `
export interface Task {
  id: string;
  title: string;
  status: 'open' | 'in-progress' | 'done';
  createdAt: Date;
}

const tasks: Task[] = [];

export function getTasks(): Task[] {
  return tasks;
}
`,
  },
  prompt:
    'Add filtering support to getTasks in src/tasks.ts. Allow filtering by status and a date range (from/to) on createdAt.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/tasks.ts',
        shouldExist: true,
        contentContains: ['status', 'filter'],
      },
    ],
  },
  tags: ['filter', 'query', 'beginner'],
};
