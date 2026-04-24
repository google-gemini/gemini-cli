/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 120000,
    hookTimeout: 60000,
    globals: true,
    environment: 'node',
    setupFiles: ['./globalSetup.ts'],
    globalSetup: ['./globalSetup.ts'],
    alias:
      process.env.USE_PUBLISHED_PACKAGES === 'true'
        ? {
            '@google/gemini-cli-core': '@google-gemini/gemini-cli-core',
          }
        : {},
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
