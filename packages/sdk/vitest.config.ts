/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@google/gemini-cli-core': path.resolve(
        __dirname,
        '../core/src/index.ts',
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test-setup.ts'],
  },
});
