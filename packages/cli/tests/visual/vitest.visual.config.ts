import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // This tells Vitest how to find the "core" package in the monorepo
    alias: {
      '@google/gemini-cli-core': path.resolve(__dirname, '../../core/src'),
      '../../config/settings.js': path.resolve(__dirname, '../../src/config/settings.tsx')
    },
  },
});
