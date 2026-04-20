/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixImportError: EvalScenario = {
  id: 'debug-fix-import-error',
  name: 'Fix Incorrect Import Path',
  category: 'debugging',
  difficulty: 'easy',
  description:
    'Fix an incorrect import path that causes a module-not-found error.',
  setupFiles: {
    'src/utils/helpers.ts': `
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
`,
    'src/main.ts': `
import { capitalize } from './helpers.js';

console.log(capitalize('hello'));
`,
  },
  prompt:
    'Fix the import error in src/main.ts. The helpers module is in src/utils/helpers.ts but the import path is wrong.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/main.ts',
        shouldExist: true,
        contentContains: ['./utils/helpers'],
        contentNotContains: ["from './helpers.js'"],
      },
    ],
  },
  tags: ['import', 'module', 'beginner'],
};
