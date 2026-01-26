/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'client',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/logs': 'http://localhost:0', // Placeholder, won't work directly in dev mode without port
      '/events': 'http://localhost:0',
    },
  },
});
