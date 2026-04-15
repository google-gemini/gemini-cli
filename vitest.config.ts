/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'scripts/tests'],
    // Global test settings
    coverage: {
      enabled: false, // Disabled by default for speed, enabled via CLI if needed
      provider: 'v8',
    },
    fileParallelism: true,
    poolOptions: {
      threads: {
        singleThread: false,
      },
      vmThreads: {
        useAtomics: true,
      },
    },
  },
});
