/**
 * @license
 * Copyright 2026 Google LLC
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
    include: ['evals/long-context/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 120000,
    setupFiles: [path.resolve(__dirname, '../packages/cli/test-setup.ts')],
    server: {
      deps: {
        inline: [/@google\/gemini-cli-core/],
      },
    },
  },
});
