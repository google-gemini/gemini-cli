/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { wasmLoader } from 'esbuild-plugin-wasm';

export const external = [
  '@lydell/node-pty',
  'node-pty',
  '@lydell/node-pty-darwin-arm64',
  '@lydell/node-pty-darwin-x64',
  '@lydell/node-pty-linux-x64',
  '@lydell/node-pty-win32-arm64',
  '@lydell/node-pty-win32-x64',
  'keytar',
  '@google/gemini-cli-devtools',
];

export const baseConfig = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  external,
  loader: { '.node': 'file' },
  write: true,
};

export const commonAliases = {
  punycode: 'punycode/',
};

export function createWasmPlugins(requireFn, rootDir) {
  const wasmBinaryPlugin = {
    name: 'wasm-binary',
    setup(build) {
      build.onResolve({ filter: /\.wasm\?binary$/ }, (args) => {
        const specifier = args.path.replace(/\?binary$/, '');
        const resolveDir = args.resolveDir || '';
        const isBareSpecifier =
          !path.isAbsolute(specifier) &&
          !specifier.startsWith('./') &&
          !specifier.startsWith('../');

        let resolvedPath;
        if (isBareSpecifier) {
          resolvedPath = requireFn.resolve(specifier, {
            paths: resolveDir ? [resolveDir, rootDir] : [rootDir],
          });
        } else {
          resolvedPath = path.isAbsolute(specifier)
            ? specifier
            : path.join(resolveDir, specifier);
        }

        return { path: resolvedPath, namespace: 'wasm-embedded' };
      });
    },
  };

  return [wasmBinaryPlugin, wasmLoader({ mode: 'embedded' })];
}

/** Creates the CLI bundle configuration. */
export function createCliConfig({ version, dirname, requireFn }) {
  return {
    ...baseConfig,
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
    },
    entryPoints: ['packages/cli/index.ts'],
    outfile: 'bundle/gemini.js',
    define: {
      'process.env.CLI_VERSION': JSON.stringify(version),
    },
    plugins: createWasmPlugins(requireFn, dirname),
    alias: {
      'is-in-ci': path.resolve(dirname, 'packages/cli/src/patches/is-in-ci.ts'),
      ...commonAliases,
    },
    metafile: true,
  };
}

/** Creates the A2A server bundle configuration. */
export function createA2aServerConfig({ version, dirname, requireFn }) {
  return {
    ...baseConfig,
    banner: {
      js: `const require = (await import('module')).createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
    },
    entryPoints: ['packages/a2a-server/src/http/server.ts'],
    outfile: 'packages/a2a-server/dist/a2a-server.mjs',
    define: {
      'process.env.CLI_VERSION': JSON.stringify(version),
    },
    plugins: createWasmPlugins(requireFn, dirname),
    alias: commonAliases,
  };
}
