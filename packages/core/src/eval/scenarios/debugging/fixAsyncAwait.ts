/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixAsyncAwait: EvalScenario = {
  id: 'debug-fix-async-await',
  name: 'Fix Missing Async/Await',
  category: 'debugging',
  difficulty: 'easy',
  description:
    'Fix a function that calls an async function but does not await the result.',
  setupFiles: {
    'src/fetcher.ts': `
async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

export function getData(url: string): string {
  const data = fetchData(url);
  return data;
}
`,
  },
  prompt:
    'Fix the async/await issue in src/fetcher.ts. The getData function calls fetchData but does not await it.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/fetcher.ts',
        shouldExist: true,
        contentContains: ['await fetchData', 'async'],
        contentNotContains: ['const data = fetchData(url);\n  return data;'],
      },
    ],
  },
  tags: ['async', 'promise', 'beginner'],
};
