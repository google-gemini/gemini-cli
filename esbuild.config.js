/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { createCliConfig, createA2aServerConfig } from './esbuild.helpers.js';

let esbuild;
try {
  esbuild = (await import('esbuild')).default;
} catch (_error) {
  console.error('esbuild not available - cannot build bundle');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const pkg = require(path.resolve(__dirname, 'package.json'));

const cliConfig = createCliConfig({
  version: pkg.version,
  dirname: __dirname,
  requireFn: require,
});

const a2aServerConfig = createA2aServerConfig({
  version: pkg.version,
  dirname: __dirname,
  requireFn: require,
});

Promise.allSettled([
  esbuild.build(cliConfig).then(({ metafile }) => {
    if (process.env.DEV === 'true') {
      writeFileSync('./bundle/esbuild.json', JSON.stringify(metafile, null, 2));
    }
  }),
  esbuild.build(a2aServerConfig),
]).then((results) => {
  const [cliResult, a2aResult] = results;
  if (cliResult.status === 'rejected') {
    console.error('gemini.js build failed:', cliResult.reason);
    process.exit(1);
  }
  // error in a2a-server bundling will not stop gemini.js bundling process
  if (a2aResult.status === 'rejected') {
    console.warn('a2a-server build failed:', a2aResult.reason);
  }
});
