/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@google/gemini-cli-core': path.resolve(dirname, '../core/src/index.js'),
      '@google/gemini-cli-test-utils': path.resolve(
        dirname,
        '../test-utils/src/index.js',
      ),
    },
  },
  test: {
    globals: true,
    reporters: ['default', 'junit'],
    environment: 'node',
    setupFiles: ['./test-setup.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks', // Back to forks for safe PTY isolation, but no worker cap
    silent: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/src/ui/components/messages/ToolStickyHeaderRegression.test.tsx',
      '**/src/ui/components/views/McpStatus.test.tsx',
      '**/src/ui/components/messages/SubagentHistoryMessage.test.tsx',
      '**/src/ui/components/BackgroundTaskDisplay.test.tsx',
      '**/src/ui/auth/useAuth.test.tsx',
    ],
    coverage: {
      enabled: false,
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*'],
      reporter: [
        ['text', { file: 'full-text-summary.txt' }],
        'html',
        'json',
        'lcov',
        'cobertura',
        ['json-summary', { outputFile: 'coverage-summary.json' }],
      ],
    },
  },
});
