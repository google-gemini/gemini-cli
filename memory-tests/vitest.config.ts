/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 600000, // 10 minutes — memory profiling is slow
    globalSetup: './globalSetup.ts',
    reporters: ['default'],
    include: ['**/*.test.ts'],
    retry: 0, // No retries for memory tests — noise is handled by tolerance
    fileParallelism: false, // Must run serially to avoid memory interference
    pool: 'forks', // Use forks pool for --expose-gc support
    poolOptions: {
      forks: {
        singleFork: true, // Single process for accurate per-test memory readings
        execArgv: ['--expose-gc'], // Enable global.gc() for forced GC
      },
    },
    env: {
      GEMINI_TEST_TYPE: 'memory',
    },
  },
});
