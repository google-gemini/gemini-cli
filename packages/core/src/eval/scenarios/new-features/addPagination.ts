/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addPagination: EvalScenario = {
  id: 'feature-add-pagination',
  name: 'Add Pagination Support',
  category: 'new-features',
  difficulty: 'medium',
  description: 'Add cursor-based pagination to a list endpoint.',
  setupFiles: {
    'src/repository.ts': `
export interface Item {
  id: string;
  name: string;
  createdAt: Date;
}

const items: Item[] = [];

export function listItems(): Item[] {
  return items;
}
`,
  },
  prompt:
    'Add cursor-based pagination to listItems in src/repository.ts. Accept cursor and limit parameters. Return items along with a nextCursor.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/repository.ts',
        shouldExist: true,
        contentContains: ['cursor', 'limit', 'nextCursor'],
      },
    ],
  },
  tags: ['pagination', 'cursor', 'intermediate'],
};
