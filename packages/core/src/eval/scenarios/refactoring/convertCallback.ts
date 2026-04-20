/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const convertCallback: EvalScenario = {
  id: 'refactor-convert-callback',
  name: 'Convert Callbacks to Async/Await',
  category: 'refactoring',
  difficulty: 'medium',
  description: 'Convert callback-style asynchronous code to use async/await.',
  setupFiles: {
    'src/fileReader.ts': `
import * as fs from 'fs';

export function readConfig(path: string, callback: (err: Error | null, data?: Record<string, string>) => void): void {
  fs.readFile(path, 'utf-8', (err, content) => {
    if (err) {
      callback(err);
      return;
    }
    try {
      const data = JSON.parse(content);
      callback(null, data);
    } catch (parseErr) {
      callback(parseErr as Error);
    }
  });
}
`,
  },
  prompt:
    'Refactor src/fileReader.ts to use async/await with fs.promises instead of callbacks.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/fileReader.ts',
        shouldExist: true,
        contentContains: ['async', 'await', 'Promise'],
        contentNotContains: ['callback'],
      },
    ],
  },
  tags: ['async', 'callback', 'promise', 'intermediate'],
};
