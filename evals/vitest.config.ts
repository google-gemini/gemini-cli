/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 300000, // 5 minutes
    reporters: ['default', 'json'],
    outputFile: {
      json: 'evals/logs/report.json',
    },
    include: ['**/*.eval.ts'],
  },
});
