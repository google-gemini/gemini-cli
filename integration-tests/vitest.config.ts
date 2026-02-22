/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    testTimeout: 300000, // 5 minutes
    globalSetup: resolve(__dirname, 'globalSetup.ts'),
    reporters: ['default'],
    include: ['**/*.test.ts'],
    retry: 2,
    fileParallelism: true,
    poolOptions: {
      threads: {
        minThreads: 8,
        maxThreads: 16,
      },
    },
    env: {
      GEMINI_TEST_TYPE: 'integration',
    },
  },
});
