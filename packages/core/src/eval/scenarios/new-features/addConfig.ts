/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addConfig: EvalScenario = {
  id: 'feature-add-config',
  name: 'Add Configuration File Support',
  category: 'new-features',
  difficulty: 'hard',
  description:
    'Add support for reading configuration from a JSON file with defaults and validation.',
  setupFiles: {
    'src/app.ts': `
export interface AppConfig {
  port: number;
  host: string;
  debug: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  port: 3000,
  host: 'localhost',
  debug: false,
};

export function getConfig(): AppConfig {
  return DEFAULT_CONFIG;
}
`,
  },
  prompt:
    'Update src/app.ts to load config from a JSON file path, merge with defaults, and validate types. Throw on invalid config. Make it async.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/app.ts',
        shouldExist: true,
        contentContains: ['async', 'readFile', 'JSON.parse'],
      },
    ],
  },
  tags: ['config', 'file', 'validation', 'advanced'],
};
