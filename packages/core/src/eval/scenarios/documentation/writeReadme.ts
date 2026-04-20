/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const writeReadme: EvalScenario = {
  id: 'docs-write-readme',
  name: 'Write README for a Module',
  category: 'documentation',
  difficulty: 'medium',
  description:
    'Generate a README.md for a utility module based on its source code.',
  setupFiles: {
    'src/index.ts': `
export { slugify } from './slugify.js';
export { debounce } from './debounce.js';
export { deepClone } from './deepClone.js';
`,
    'src/slugify.ts': `
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
`,
    'src/debounce.ts': `
export function debounce<T extends (...args: unknown[]) => void>(fn: T, delayMs: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  }) as T;
}
`,
    'src/deepClone.ts': `
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
`,
  },
  prompt:
    'Write a README.md for this utility module. Include a description, installation, and usage examples for each exported function.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'README.md',
        shouldExist: true,
        contentContains: ['slugify', 'debounce', 'deepClone', '##'],
      },
    ],
  },
  tags: ['readme', 'module', 'intermediate'],
};
