/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addCache: EvalScenario = {
  id: 'feature-add-cache',
  name: 'Add In-Memory Cache with TTL',
  category: 'new-features',
  difficulty: 'medium',
  description:
    'Add an in-memory cache with time-to-live support to avoid redundant computations.',
  setupFiles: {
    'src/dataService.ts': `
export class DataService {
  async getExpensiveData(key: string): Promise<string> {
    // Simulate expensive computation
    await new Promise(resolve => setTimeout(resolve, 1000));
    return \`data-for-\${key}\`;
  }
}
`,
  },
  prompt:
    'Add an in-memory cache with TTL (time-to-live) to DataService in src/dataService.ts. Cache results of getExpensiveData and return cached values within the TTL window.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/dataService.ts',
        shouldExist: true,
        contentContains: ['cache', 'Map', 'ttl'],
      },
    ],
  },
  tags: ['cache', 'ttl', 'performance', 'intermediate'],
};
