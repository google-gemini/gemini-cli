/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const deduplicateCode: EvalScenario = {
  id: 'refactor-deduplicate-code',
  name: 'Deduplicate Similar Functions',
  category: 'refactoring',
  difficulty: 'medium',
  description:
    'Merge multiple nearly-identical functions that differ only in a single parameter.',
  setupFiles: {
    'src/logger.ts': `
export function logInfo(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(\`[\${timestamp}] [INFO] \${message}\`);
}

export function logWarning(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(\`[\${timestamp}] [WARNING] \${message}\`);
}

export function logError(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(\`[\${timestamp}] [ERROR] \${message}\`);
}

export function logDebug(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(\`[\${timestamp}] [DEBUG] \${message}\`);
}
`,
  },
  prompt:
    'Deduplicate the logging functions in src/logger.ts by creating a generic log function parameterized by log level.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/logger.ts',
        shouldExist: true,
        contentContains: ['level'],
      },
    ],
  },
  tags: ['duplication', 'DRY', 'intermediate'],
};
