/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const findMemoryLeak: EvalScenario = {
  id: 'review-find-memory-leak',
  name: 'Find Memory Leak in Cache',
  category: 'code-review',
  difficulty: 'medium',
  description:
    'Identify a memory leak in a cache that grows unbounded because entries are never evicted.',
  setupFiles: {
    'src/cache.ts': `
const cache = new Map<string, { data: unknown; timestamp: number }>();

export function cacheGet(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (entry) return entry.data;
  return undefined;
}

export function cacheSet(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function processRequest(key: string, compute: () => unknown): unknown {
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  const result = compute();
  cacheSet(key, result);
  return result;
}
`,
  },
  prompt:
    'Review src/cache.ts for memory issues. The cache grows without bound. Add a max size or TTL-based eviction strategy.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/cache.ts',
        shouldExist: true,
        contentContains: ['delete', 'size'],
      },
    ],
    outputContains: ['memory'],
  },
  tags: ['memory-leak', 'cache', 'intermediate'],
};
