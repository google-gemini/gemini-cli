/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist/client', { recursive: true });

await esbuild.build({
  entryPoints: ['client/src/main.tsx'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  jsx: 'automatic',
  outfile: 'dist/client/main.js',
});
