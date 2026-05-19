/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  external,
  baseConfig,
  cliConfig,
  workerConfig,
  a2aServerConfig,
  createWasmPlugins,
} from '../../esbuild.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

describe('esbuild.config: native module externalization', () => {
  it('marks node-pty and all @lydell/node-pty platform packages as external', () => {
    expect(external).toEqual(
      expect.arrayContaining([
        'node-pty',
        '@lydell/node-pty',
        '@lydell/node-pty-darwin-arm64',
        '@lydell/node-pty-darwin-x64',
        '@lydell/node-pty-linux-x64',
        '@lydell/node-pty-win32-arm64',
        '@lydell/node-pty-win32-x64',
      ]),
    );
  });

  it('marks @github/keytar as external', () => {
    expect(external).toContain('@github/keytar');
  });

  it('exposes the external list on every build config', () => {
    expect(baseConfig.external).toBe(external);
    expect(cliConfig.external).toBe(external);
    expect(workerConfig.external).toBe(external);
    expect(a2aServerConfig.external).toBe(external);
  });
});

describe('esbuild.config: bundle shape', () => {
  it('produces an ESM bundle targeting node', () => {
    for (const config of [cliConfig, workerConfig, a2aServerConfig]) {
      expect(config.platform).toBe('node');
      expect(config.format).toBe('esm');
      expect(config.bundle).toBe(true);
    }
  });

  it('treats .node addons as file loader so they are not inlined', () => {
    expect(cliConfig.loader['.node']).toBe('file');
    expect(workerConfig.loader['.node']).toBe('file');
    expect(a2aServerConfig.loader['.node']).toBe('file');
  });

  it('builds the CLI from packages/cli/index.ts into the bundle directory', () => {
    expect(cliConfig.entryPoints).toEqual({ gemini: 'packages/cli/index.ts' });
    expect(cliConfig.outdir).toBe('bundle');
  });
});

describe('esbuild.config: wasm-binary plugin', () => {
  function runOnResolve(args) {
    const plugins = createWasmPlugins();
    const wasmBinaryPlugin = plugins[0];
    expect(wasmBinaryPlugin.name).toBe('wasm-binary');

    let registered;
    const fakeBuild = {
      onResolve(filter, callback) {
        registered = { filter, callback };
      },
    };
    wasmBinaryPlugin.setup(fakeBuild);
    expect(registered.filter.filter.test('foo.wasm?binary')).toBe(true);
    return registered.callback(args);
  }

  it('resolves relative .wasm?binary specifiers against the importer directory', () => {
    const result = runOnResolve({
      path: './fixture.wasm?binary',
      resolveDir: '/tmp/fake-importer',
    });

    expect(result.namespace).toBe('wasm-embedded');
    expect(result.path).toBe(path.join('/tmp/fake-importer', 'fixture.wasm'));
  });

  it('keeps absolute .wasm?binary paths untouched', () => {
    const absolute = path.resolve('/tmp', 'absolute.wasm');
    const result = runOnResolve({
      path: `${absolute}?binary`,
      resolveDir: '/tmp/fake-importer',
    });

    expect(result.namespace).toBe('wasm-embedded');
    expect(result.path).toBe(absolute);
  });

  it('resolves bare .wasm?binary specifiers via Node module resolution from the repo root', () => {
    // web-tree-sitter ships a bundled tree-sitter.wasm and is imported as a bare
    // specifier from packages/core/src/utils/shell-utils.ts. If this dependency ever
    // moves, update both the source import and this test to point at the new package.
    const result = runOnResolve({
      path: 'web-tree-sitter/tree-sitter.wasm?binary',
      resolveDir: '',
    });

    expect(result.namespace).toBe('wasm-embedded');
    expect(path.isAbsolute(result.path)).toBe(true);
    expect(result.path).toMatch(/tree-sitter\.wasm$/);
    expect(result.path.startsWith(repoRoot)).toBe(true);
  });
});
