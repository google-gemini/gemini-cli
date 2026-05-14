/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock esbuild before importing esbuild.config.js so that the top-level
// Promise.allSettled([esbuild.build(...)]) trailer in that file does not
// actually run a build while the test module is being evaluated.
vi.mock('esbuild', () => ({
  default: {
    build: vi.fn(async () => ({ metafile: { inputs: {}, outputs: {} } })),
  },
}));

// esbuild-plugin-wasm is invoked from createWasmPlugins(). Replace it with
// a stub plugin so the test does not depend on wasm-loader internals.
vi.mock('esbuild-plugin-wasm', () => ({
  wasmLoader: vi.fn(() => ({ name: 'wasm-loader-stub', setup: vi.fn() })),
}));

type EsbuildConfigExports = {
  external: readonly string[];
  baseConfig: {
    bundle: boolean;
    platform: string;
    format: string;
    external: readonly string[];
    loader: Record<string, string>;
    write: boolean;
  };
  commonAliases: Record<string, string>;
  createWasmPlugins: () => Array<{
    name: string;
    setup: (build: unknown) => void;
  }>;
};

let mod: EsbuildConfigExports;

beforeAll(async () => {
  mod = (await import(
    '../../esbuild.config.js'
  )) as unknown as EsbuildConfigExports;
});

describe('esbuild.config external modules', () => {
  it('marks node-pty and its platform-specific prebuilds as external', () => {
    expect(mod.external).toContain('node-pty');
    expect(mod.external).toContain('@lydell/node-pty');
    expect(mod.external).toContain('@lydell/node-pty-darwin-arm64');
    expect(mod.external).toContain('@lydell/node-pty-darwin-x64');
    expect(mod.external).toContain('@lydell/node-pty-linux-x64');
    expect(mod.external).toContain('@lydell/node-pty-win32-arm64');
    expect(mod.external).toContain('@lydell/node-pty-win32-x64');
  });

  it('marks keytar as external so keychain native addons are not bundled', () => {
    expect(mod.external).toContain('@github/keytar');
  });

  it('marks gemini-cli-devtools as external (workspace package resolved at runtime)', () => {
    expect(mod.external).toContain('@google/gemini-cli-devtools');
  });
});

describe('esbuild.config baseConfig', () => {
  it('targets node', () => {
    expect(mod.baseConfig.platform).toBe('node');
  });

  it('produces ESM output', () => {
    expect(mod.baseConfig.format).toBe('esm');
  });

  it('enables bundling', () => {
    expect(mod.baseConfig.bundle).toBe(true);
  });

  it('writes the bundle to disk', () => {
    expect(mod.baseConfig.write).toBe(true);
  });

  it('routes .node binaries through the "file" loader', () => {
    expect(mod.baseConfig.loader).toHaveProperty('.node', 'file');
  });

  it('wires baseConfig.external to the exported external array (single source of truth)', () => {
    expect(mod.baseConfig.external).toBe(mod.external);
  });
});

describe('esbuild.config commonAliases', () => {
  it('remaps punycode to the userland package with a trailing slash', () => {
    // The trailing slash is load-bearing: without it, Node's built-in
    // `punycode` module shadows the npm package resolver.
    expect(mod.commonAliases.punycode).toBe('punycode/');
  });
});

describe('esbuild.config createWasmPlugins', () => {
  it('returns a wasm-binary plugin alongside the esbuild-plugin-wasm loader', () => {
    const plugins = mod.createWasmPlugins();
    expect(plugins).toHaveLength(2);
    expect(plugins[0]!.name).toBe('wasm-binary');
    expect(typeof plugins[0]!.setup).toBe('function');
  });

  it('registers an onResolve handler with the correct .wasm?binary filter', () => {
    const plugins = mod.createWasmPlugins();
    const wasmBinary = plugins[0]!;
    const onResolve = vi.fn();
    wasmBinary.setup({ onResolve });
    expect(onResolve).toHaveBeenCalledTimes(1);
    const filterArg = onResolve.mock.calls[0]![0] as { filter: RegExp };
    expect(filterArg.filter.test('some-pkg/foo.wasm?binary')).toBe(true);
    expect(filterArg.filter.test('foo.wasm')).toBe(false);
  });

  it('resolves absolute and relative wasm paths without touching node resolution', () => {
    const plugins = mod.createWasmPlugins();
    const wasmBinary = plugins[0]!;
    const onResolve = vi.fn();
    wasmBinary.setup({ onResolve });
    const handler = onResolve.mock.calls[0]![1] as (args: {
      path: string;
      resolveDir?: string;
    }) => { path: string; namespace: string };

    const absoluteResult = handler({ path: '/tmp/fixture.wasm?binary' });
    expect(absoluteResult.namespace).toBe('wasm-embedded');
    expect(absoluteResult.path).toBe('/tmp/fixture.wasm');

    const relativeResult = handler({
      path: './rel.wasm?binary',
      resolveDir: '/tmp',
    });
    expect(relativeResult.namespace).toBe('wasm-embedded');
    expect(relativeResult.path).toBe('/tmp/rel.wasm');
  });
});
