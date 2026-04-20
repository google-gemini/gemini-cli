/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const modernizeSyntax: EvalScenario = {
  id: 'refactor-modernize-syntax',
  name: 'Modernize Legacy JavaScript Syntax',
  category: 'refactoring',
  difficulty: 'easy',
  description: 'Convert legacy JavaScript patterns to modern ES2020+ syntax.',
  setupFiles: {
    'src/legacy.ts': `
export function mergeOptions(defaults: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  var result: Record<string, unknown> = {};
  var keys = Object.keys(defaults);
  for (var i = 0; i < keys.length; i++) {
    result[keys[i]] = defaults[keys[i]];
  }
  var overrideKeys = Object.keys(overrides);
  for (var j = 0; j < overrideKeys.length; j++) {
    result[overrideKeys[j]] = overrides[overrideKeys[j]];
  }
  return result;
}

export function getNestedValue(obj: Record<string, unknown>, key1: string, key2: string): unknown {
  return obj && obj[key1] && (obj[key1] as Record<string, unknown>)[key2];
}
`,
  },
  prompt:
    'Modernize src/legacy.ts: replace var with const/let, use spread operator, optional chaining, etc.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/legacy.ts',
        shouldExist: true,
        contentNotContains: ['var result', 'var keys', 'var i'],
      },
    ],
  },
  tags: ['modernize', 'es2020', 'beginner'],
};
