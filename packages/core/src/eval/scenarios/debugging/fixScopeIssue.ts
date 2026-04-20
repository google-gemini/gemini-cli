/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const fixScopeIssue: EvalScenario = {
  id: 'debug-fix-scope-issue',
  name: 'Fix Variable Scope Issue',
  category: 'debugging',
  difficulty: 'medium',
  description:
    'Fix a closure scope issue where a var in a loop captures the wrong value.',
  setupFiles: {
    'src/handlers.ts': `
export function createHandlers(names: string[]): (() => string)[] {
  const handlers: (() => string)[] = [];
  for (var i = 0; i < names.length; i++) {
    handlers.push(() => names[i]);
  }
  return handlers;
}
`,
  },
  prompt:
    'Fix the variable scope issue in src/handlers.ts. All closures capture the same var i, so they all return undefined. Use let or another fix.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/handlers.ts',
        shouldExist: true,
        contentNotContains: ['for (var i'],
      },
    ],
  },
  tags: ['scope', 'closure', 'var', 'intermediate'],
};
