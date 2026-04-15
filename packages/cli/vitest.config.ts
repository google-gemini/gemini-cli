/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    conditions: ['test'],
  },
  test: {
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}', 'config.test.ts'],
    environment: 'node',
    globals: true,
    reporters: ['default', 'junit'],

    outputFile: {
      junit: 'junit.xml',
    },
    alias: {
      react: path.resolve(__dirname, '../../node_modules/react'),
    },
    setupFiles: ['./test-setup.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'threads',
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
      enabled: true,
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
    server: {
      deps: {
        inline: [/@google\/gemini-cli-core/],
      },
    },
  },
});
