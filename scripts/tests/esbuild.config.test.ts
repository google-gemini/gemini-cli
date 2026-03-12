/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import {
  external,
  baseConfig,
  commonAliases,
  createWasmPlugins,
  createCliConfig,
  createA2aServerConfig,
} from '../../esbuild.helpers.js';

describe('esbuild configuration', () => {
  describe('external modules', () => {
    it('excludes node-pty to prevent bundling native addons', () => {
      expect(external).toContain('node-pty');
      expect(external).toContain('@lydell/node-pty');
    });

    it('excludes all platform-specific node-pty packages', () => {
      const platforms = [
        '@lydell/node-pty-darwin-arm64',
        '@lydell/node-pty-darwin-x64',
        '@lydell/node-pty-linux-x64',
        '@lydell/node-pty-win32-arm64',
        '@lydell/node-pty-win32-x64',
      ];
      for (const pkg of platforms) {
        expect(external).toContain(pkg);
      }
    });

    it('excludes keytar native module', () => {
      expect(external).toContain('keytar');
    });

    it('excludes devtools package', () => {
      expect(external).toContain('@google/gemini-cli-devtools');
    });
  });

  describe('base configuration', () => {
    it('targets the node platform', () => {
      expect(baseConfig.platform).toBe('node');
    });

    it('uses ESM output format', () => {
      expect(baseConfig.format).toBe('esm');
    });

    it('enables bundling', () => {
      expect(baseConfig.bundle).toBe(true);
    });

    it('enables writing output to disk', () => {
      expect(baseConfig.write).toBe(true);
    });

    it('references the external modules array', () => {
      expect(baseConfig.external).toBe(external);
    });

    it('uses file loader for .node native addon files', () => {
      expect(baseConfig.loader).toEqual({ '.node': 'file' });
    });
  });

  describe('common aliases', () => {
    it('aliases punycode to the userland package', () => {
      expect(commonAliases.punycode).toBe('punycode/');
    });
  });

  describe('CLI build configuration', () => {
    const cliConfig = createCliConfig({
      version: '1.0.0-test',
      dirname: '/test/root',
      requireFn: { resolve: vi.fn() },
    });

    it('has correct entry point', () => {
      expect(cliConfig).toHaveProperty('entryPoints', [
        'packages/cli/index.ts',
      ]);
    });

    it('outputs to bundle/gemini.js', () => {
      expect(cliConfig).toHaveProperty('outfile', 'bundle/gemini.js');
    });

    it('defines CLI_VERSION from package version', () => {
      expect(cliConfig).toHaveProperty(
        ['define', 'process.env.CLI_VERSION'],
        '"1.0.0-test"',
      );
    });

    it('enables metafile generation', () => {
      expect(cliConfig).toHaveProperty('metafile', true);
    });

    it('aliases is-in-ci to the local patch file', () => {
      expect(cliConfig).toHaveProperty(
        ['alias', 'is-in-ci'],
        path.resolve('/test/root', 'packages/cli/src/patches/is-in-ci.ts'),
      );
    });

    it('includes commonAliases in alias config', () => {
      expect(cliConfig).toHaveProperty(['alias', 'punycode'], 'punycode/');
    });

    it('inherits base config properties', () => {
      expect(cliConfig).toMatchObject({
        platform: 'node',
        format: 'esm',
        bundle: true,
        external,
      });
    });

    it('includes CJS compatibility shim in banner', () => {
      expect(cliConfig).toHaveProperty(
        ['banner', 'js'],
        `import { createRequire } from 'module'; const require = createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
      );
    });

    it('uses WASM plugins', () => {
      expect(cliConfig).toHaveProperty('plugins');
      expect(cliConfig.plugins).toHaveLength(2);
      expect(cliConfig.plugins[0].name).toBe('wasm-binary');
    });
  });

  describe('a2a-server build configuration', () => {
    const a2aConfig = createA2aServerConfig({
      version: '1.0.0-test',
      dirname: '/test/root',
      requireFn: { resolve: vi.fn() },
    });

    it('has correct entry point', () => {
      expect(a2aConfig).toHaveProperty('entryPoints', [
        'packages/a2a-server/src/http/server.ts',
      ]);
    });

    it('outputs to the correct path', () => {
      expect(a2aConfig).toHaveProperty(
        'outfile',
        'packages/a2a-server/dist/a2a-server.mjs',
      );
    });

    it('defines CLI_VERSION from package version', () => {
      expect(a2aConfig).toHaveProperty(
        ['define', 'process.env.CLI_VERSION'],
        '"1.0.0-test"',
      );
    });

    it('inherits base config properties', () => {
      expect(a2aConfig).toMatchObject({
        platform: 'node',
        format: 'esm',
        bundle: true,
        external,
      });
    });

    it('includes CJS compatibility shim in banner', () => {
      expect(a2aConfig).toHaveProperty(
        ['banner', 'js'],
        `const require = (await import('module')).createRequire(import.meta.url); globalThis.__filename = require('url').fileURLToPath(import.meta.url); globalThis.__dirname = require('path').dirname(globalThis.__filename);`,
      );
    });

    it('uses WASM plugins', () => {
      expect(a2aConfig).toHaveProperty('plugins');
      expect(a2aConfig.plugins).toHaveLength(2);
      expect(a2aConfig.plugins[0].name).toBe('wasm-binary');
    });

    it('uses commonAliases', () => {
      expect(a2aConfig.alias).toEqual(commonAliases);
    });
  });

  describe('WASM plugin resolution', () => {
    function getOnResolveCallback(
      requireFn: { resolve: ReturnType<typeof vi.fn> },
      rootDir: string,
    ) {
      const plugins = createWasmPlugins(requireFn, rootDir);
      const wasmBinaryPlugin = plugins.find(
        (p: { name: string }) => p.name === 'wasm-binary',
      );

      let resolveCallback:
        | ((args: { path: string; resolveDir: string }) => {
            path: string;
            namespace: string;
          })
        | undefined;
      const mockBuild = {
        onResolve: vi.fn(
          (_filter: unknown, callback: typeof resolveCallback) => {
            resolveCallback = callback;
          },
        ),
      };
      wasmBinaryPlugin.setup(mockBuild);

      if (!resolveCallback) {
        throw new Error('onResolve callback was not registered');
      }
      return resolveCallback;
    }

    it('resolves bare specifiers through require.resolve', () => {
      const mockRequire = {
        resolve: vi.fn().mockReturnValue('/resolved/tiktoken_bg.wasm'),
      };
      const resolve = getOnResolveCallback(mockRequire, '/project');
      const result = resolve({
        path: 'tiktoken/tiktoken_bg.wasm?binary',
        resolveDir: '/some/dir',
      });

      expect(mockRequire.resolve).toHaveBeenCalledWith(
        'tiktoken/tiktoken_bg.wasm',
        { paths: ['/some/dir', '/project'] },
      );
      expect(result).toEqual({
        path: '/resolved/tiktoken_bg.wasm',
        namespace: 'wasm-embedded',
      });
    });

    it('resolves relative paths against resolveDir', () => {
      const mockRequire = { resolve: vi.fn() };
      const resolve = getOnResolveCallback(mockRequire, '/project');
      const result = resolve({
        path: './local.wasm?binary',
        resolveDir: '/some/dir',
      });

      expect(mockRequire.resolve).not.toHaveBeenCalled();
      expect(result).toEqual({
        path: path.join('/some/dir', './local.wasm'),
        namespace: 'wasm-embedded',
      });
    });

    it('resolves parent-relative paths against resolveDir', () => {
      const mockRequire = { resolve: vi.fn() };
      const resolve = getOnResolveCallback(mockRequire, '/project');
      const result = resolve({
        path: '../other/file.wasm?binary',
        resolveDir: '/some/dir',
      });

      expect(mockRequire.resolve).not.toHaveBeenCalled();
      expect(result.path).toBe(path.join('/some/dir', '../other/file.wasm'));
      expect(result.namespace).toBe('wasm-embedded');
    });

    it('preserves absolute paths as-is', () => {
      const mockRequire = { resolve: vi.fn() };
      const resolve = getOnResolveCallback(mockRequire, '/project');
      const result = resolve({
        path: '/absolute/path/to/file.wasm?binary',
        resolveDir: '/some/dir',
      });

      expect(mockRequire.resolve).not.toHaveBeenCalled();
      expect(result).toEqual({
        path: '/absolute/path/to/file.wasm',
        namespace: 'wasm-embedded',
      });
    });

    it('falls back to rootDir when resolveDir is empty', () => {
      const mockRequire = {
        resolve: vi.fn().mockReturnValue('/resolved/pkg.wasm'),
      };
      const resolve = getOnResolveCallback(mockRequire, '/project');
      resolve({
        path: 'some-pkg/file.wasm?binary',
        resolveDir: '',
      });

      expect(mockRequire.resolve).toHaveBeenCalledWith('some-pkg/file.wasm', {
        paths: ['/project'],
      });
    });

    it('returns two plugins (wasm-binary and wasm-loader)', () => {
      const plugins = createWasmPlugins({ resolve: vi.fn() }, '/project');
      expect(plugins).toHaveLength(2);
      expect(plugins[0].name).toBe('wasm-binary');
    });
  });
});
