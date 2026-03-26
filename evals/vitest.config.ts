/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    conditions: ['test'],
  },
  test: {
    testTimeout: 300000, // 5 minutes
    reporters: ['default', 'json'],
    outputFile: {
      json: 'evals/logs/report.json',
    },
    include: ['**/*.eval.ts'],
    environment: 'node',
    globals: true,
    alias: {
      react: path.resolve(__dirname, '../node_modules/react'),
    },
    setupFiles: [path.resolve(__dirname, '../packages/cli/test-setup.ts')],
    server: {
      deps: {
        inline: [/@google\/gemini-cli-core/],
      },
    },
  },
});
