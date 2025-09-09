/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { build } from 'esbuild';

build({
  entryPoints: ['scripts/get-release-version.js'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/get-release-version.js',
  format: 'esm',
}).catch(() => process.exit(1));
