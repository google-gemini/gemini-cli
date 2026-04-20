/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const checkErrorHandling: EvalScenario = {
  id: 'review-check-error-handling',
  name: 'Check Error Handling Gaps',
  category: 'code-review',
  difficulty: 'medium',
  description:
    'Identify missing or inadequate error handling in async operations.',
  setupFiles: {
    'src/fileOps.ts': `
import * as fs from 'fs/promises';

export async function readJsonFile(path: string): Promise<unknown> {
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content);
}

export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data);
  await fs.writeFile(path, content);
}

export async function copyFile(src: string, dest: string): Promise<void> {
  const content = await fs.readFile(src);
  await fs.writeFile(dest, content);
}
`,
  },
  prompt:
    'Review src/fileOps.ts for error handling issues. Add try/catch with meaningful error messages. Handle file-not-found, invalid JSON, and write failures.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/fileOps.ts',
        shouldExist: true,
        contentContains: ['try', 'catch', 'Error'],
      },
    ],
  },
  tags: ['error-handling', 'async', 'intermediate'],
};
