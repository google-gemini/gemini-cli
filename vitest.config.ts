/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Explicitly list packages that have valid vitest configurations.
    // This avoids startup errors from packages like vscode-ide-companion.
    projects: [
      'packages/cli',
      'packages/core',
      'packages/sdk',
      'packages/a2a-server',
      'packages/test-utils',
    ],
    include: ['**/*.test.{ts,tsx}'],
    // Global test settings
    coverage: {
      enabled: false,
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
