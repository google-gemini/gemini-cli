/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addExamples: EvalScenario = {
  id: 'docs-add-examples',
  name: 'Add Usage Examples to Documentation',
  category: 'documentation',
  difficulty: 'easy',
  description:
    'Add @example JSDoc tags with code samples to documented functions.',
  setupFiles: {
    'src/stringUtils.ts': `
/**
 * Truncates a string to a maximum length, appending an ellipsis if truncated.
 * @param str - The input string.
 * @param maxLength - The maximum length.
 * @returns The truncated string.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Converts a string to kebab-case.
 * @param str - The input string in camelCase or PascalCase.
 * @returns The kebab-case string.
 */
export function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
`,
  },
  prompt:
    'Add @example tags with usage examples to the JSDoc comments in src/stringUtils.ts.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/stringUtils.ts',
        shouldExist: true,
        contentContains: ['@example'],
      },
    ],
  },
  tags: ['jsdoc', 'examples', 'beginner'],
};
