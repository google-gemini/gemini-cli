/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 600000, // 10 minutes
    globalSetup: './globalSetup.ts',
    reporters: ['default'],
    include: ['**/*.test.ts'],
    retry: 2,
    fileParallelism: true,
    poolOptions: {
      threads: {
        minThreads: 2,
        maxThreads: 4,
      },
    },
  },
});
