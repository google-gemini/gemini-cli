/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const simplifyConditionals: EvalScenario = {
  id: 'refactor-simplify-conditionals',
  name: 'Simplify Nested Conditionals',
  category: 'refactoring',
  difficulty: 'medium',
  description:
    'Simplify deeply nested if/else blocks using early returns or guard clauses.',
  setupFiles: {
    'src/auth.ts': `
export function canAccess(user: { role: string; active: boolean; verified: boolean }): boolean {
  if (user) {
    if (user.active) {
      if (user.verified) {
        if (user.role === 'admin' || user.role === 'editor') {
          return true;
        } else {
          return false;
        }
      } else {
        return false;
      }
    } else {
      return false;
    }
  } else {
    return false;
  }
}
`,
  },
  prompt:
    'Simplify the deeply nested conditionals in src/auth.ts using early returns or guard clauses.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/auth.ts',
        shouldExist: true,
        contentContains: ['return'],
        contentNotContains: [
          '} else {\n      return false;\n    }\n  } else {',
        ],
      },
    ],
  },
  tags: ['conditionals', 'guard-clause', 'intermediate'],
};
