/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 600000, // 10 minutes — performance profiling needs time for multiple samples
    globalSetup: './globalSetup.ts',
    reporters: ['default'],
    include: ['**/*.test.ts'],
    retry: 0, // No retries — noise is handled by IQR filtering and tolerance
    fileParallelism: false, // Must run serially to avoid CPU contention
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Single process for accurate per-test CPU readings
      },
    },
    env: {
      GEMINI_TEST_TYPE: 'perf',
    },
  },
});
