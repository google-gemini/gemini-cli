/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const replaceSwitch: EvalScenario = {
  id: 'refactor-replace-switch',
  name: 'Replace Switch with Strategy Pattern',
  category: 'refactoring',
  difficulty: 'hard',
  description:
    'Replace a large switch statement with a strategy/map pattern for better extensibility.',
  setupFiles: {
    'src/parser.ts': `
export function parse(type: string, input: string): unknown {
  switch (type) {
    case 'json':
      return JSON.parse(input);
    case 'csv':
      return input.split('\\n').map(line => line.split(','));
    case 'yaml':
      return input; // placeholder
    case 'xml':
      return input; // placeholder
    case 'ini':
      return input; // placeholder
    default:
      throw new Error(\`Unknown format: \${type}\`);
  }
}
`,
  },
  prompt:
    'Refactor src/parser.ts to replace the switch statement with a parser registry (map of type -> parser function) pattern.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/parser.ts',
        shouldExist: true,
        contentContains: ['Map', 'Record'],
        contentNotContains: ['switch (type)'],
      },
    ],
  },
  tags: ['switch', 'strategy-pattern', 'advanced'],
};
