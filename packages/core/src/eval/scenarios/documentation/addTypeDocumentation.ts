/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvalScenario } from '../../types.js';

export const addTypeDocumentation: EvalScenario = {
  id: 'docs-add-type-documentation',
  name: 'Add Documentation to Type Definitions',
  category: 'documentation',
  difficulty: 'easy',
  description:
    'Add JSDoc comments to all interface properties and type aliases.',
  setupFiles: {
    'src/types.ts': `
export interface ServerConfig {
  port: number;
  host: string;
  ssl: boolean;
  maxConnections: number;
  timeout: number;
  corsOrigins: string[];
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogConfig {
  level: LogLevel;
  format: 'json' | 'text';
  destination: string;
  rotate: boolean;
  maxSize: number;
}
`,
  },
  prompt:
    'Add JSDoc comments to all interface properties and the type alias in src/types.ts. Describe what each field does.',
  expectedOutcome: {
    fileChanges: [
      {
        path: 'src/types.ts',
        shouldExist: true,
        contentContains: ['/**', '*/'],
      },
    ],
  },
  tags: ['jsdoc', 'types', 'beginner'],
};
