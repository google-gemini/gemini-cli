/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const removeDeadCode: EvalScenario = {
  id: 'refactor-remove-dead-code',
  name: 'Remove Dead Code',
  category: 'refactoring',
  difficulty: 'easy',
  description: 'Remove unreachable code and unused functions from a module.',
  setupFiles: {
    'src/utils.ts': `
export function formatName(first: string, last: string): string {
  return \`\${first} \${last}\`;
}

function oldFormatName(f: string, l: string): string {
  return f + ' ' + l;
}

export function getFullName(first: string, last: string): string {
  return formatName(first, last);
  console.log('Name formatted');
  return first;
}

function deprecatedHelper(): void {
  // This function is no longer called anywhere
  console.log('deprecated');
}
`,
  },
  prompt:
    'Remove all dead code from src/utils.ts: unused functions and unreachable statements.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/utils.ts',
        shouldExist: true,
        contentNotContains: [
          'oldFormatName',
          'deprecatedHelper',
          "console.log('Name formatted')",
        ],
      },
    ],
  },
  tags: ['dead-code', 'cleanup', 'beginner'],
};
