/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const pkg = require(path.resolve(__dirname, 'package.json'));

esbuild
  .build({
    entryPoints: ['packages/cli/index.ts'],
    bundle: true,
    outfile: 'bundle/trust.js',
    platform: 'node',
    format: 'esm',
    define: {
      'process.env.CLI_VERSION': JSON.stringify(pkg.version),
    },
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
    },
    external: [
      // External node-llama-cpp platform-specific bindings
      '@node-llama-cpp/mac-arm64-metal',
      '@node-llama-cpp/mac-x64',
      '@node-llama-cpp/win-x64-cuda',
      '@node-llama-cpp/win-x64-vulkan',
      '@node-llama-cpp/win-x64',
      '@node-llama-cpp/win-arm64',
      '@node-llama-cpp/linux-x64-cuda',
      '@node-llama-cpp/linux-x64-vulkan',
      '@node-llama-cpp/linux-x64',
      '@node-llama-cpp/linux-arm64',
      // External reflink bindings
      '@reflink/reflink-linux-x64-musl',
      '@reflink/reflink-linux-x64-gnu',
      '@reflink/reflink-win32-x64-msvc',
      '@reflink/reflink-darwin-x64',
      '@reflink/reflink-darwin-arm64',
      // Core node-llama-cpp modules that need to be external
      'node-llama-cpp',
    ],
  })
  .catch(() => process.exit(1));
