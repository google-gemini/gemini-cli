/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addCliFlag: EvalScenario = {
  id: 'feature-add-cli-flag',
  name: 'Add a New CLI Flag',
  category: 'new-features',
  difficulty: 'medium',
  description:
    'Add a new --verbose flag to a CLI application that enables detailed output.',
  setupFiles: {
    'src/cli.ts': `
export interface CliOptions {
  output: string;
  format: 'json' | 'text';
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { output: 'stdout', format: 'text' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i++;
    }
    if (args[i] === '--format' && args[i + 1]) {
      options.format = args[i + 1] as 'json' | 'text';
      i++;
    }
  }
  return options;
}
`,
  },
  prompt:
    'Add a --verbose boolean flag to the CLI in src/cli.ts. Update the CliOptions interface and parseArgs function.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/cli.ts',
        shouldExist: true,
        contentContains: ['verbose', '--verbose'],
      },
    ],
  },
  tags: ['cli', 'flag', 'intermediate'],
};
