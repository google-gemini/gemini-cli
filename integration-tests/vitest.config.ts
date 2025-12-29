/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 300000, // 5 minutes
    globalSetup: './globalSetup.ts',
    reporters: ['default'],
    include: ['**/*.test.ts'],
    retry: 2,
    pool: 'forks',
    fileParallelism: true,
    maxWorkers: 16,
    minWorkers: 8,
    poolOptions: {
      forks: {
        isolate: true,
      },
    },
  },
});
