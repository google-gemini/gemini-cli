/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.unmock('fs');
vi.unmock('node:fs');
import * as esbuild from 'esbuild';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

describe('proxy-agent bundle shape and interop', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'gemini-proxy-test-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('preserves named and default constructors after ESM splitting', async () => {
    const entryFile = path.join(tmpDir, 'entry.ts');

    // Create an entry file that tests both static and dynamic imports
    writeFileSync(
      entryFile,
      `
      import StaticHttpsDefault from 'https-proxy-agent';
      import { HttpsProxyAgent as StaticHttpsNamed } from 'https-proxy-agent';
      import StaticHttpDefault from 'http-proxy-agent';
      import { HttpProxyAgent as StaticHttpNamed } from 'http-proxy-agent';

      export async function getAgents() {
        const httpsMod = await import('https-proxy-agent');
        const httpMod = await import('http-proxy-agent');
        return {
          https: httpsMod,
          http: httpMod,
          staticHttpsDefault: StaticHttpsDefault,
          staticHttpsNamed: StaticHttpsNamed,
          staticHttpDefault: StaticHttpDefault,
          staticHttpNamed: StaticHttpNamed,
        };
      }
      `,
    );

    // Bundle with the exact same splitting config and aliases as cliConfig
    await esbuild.build({
      entryPoints: { gemini: entryFile },
      outdir: path.join(tmpDir, 'bundle'),
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'node',
      outExtension: { '.js': '.mjs' },
      alias: {
        'https-proxy-agent': path.resolve(
          projectRoot,
          'packages/cli/src/patches/https-proxy-agent.ts',
        ),
        'http-proxy-agent': path.resolve(
          projectRoot,
          'packages/cli/src/patches/http-proxy-agent.ts',
        ),
      },
    });

    // Import the bundled chunk
    const bundledEntryUrl = pathToFileURL(
      path.join(tmpDir, 'bundle/gemini.mjs'),
    ).href;
    const { getAgents } = await import(bundledEntryUrl);

    const {
      https,
      http,
      staticHttpsDefault,
      staticHttpsNamed,
      staticHttpDefault,
      staticHttpNamed,
    } = await getAgents();

    // Verify named exports exist and are functions
    expect(typeof https.HttpsProxyAgent).toBe('function');
    expect(typeof http.HttpProxyAgent).toBe('function');

    // Verify default exports exist and are functions
    expect(typeof https.default).toBe('function');
    expect(typeof http.default).toBe('function');

    // Verify static imports work
    expect(typeof staticHttpsDefault).toBe('function');
    expect(typeof staticHttpsNamed).toBe('function');
    expect(typeof staticHttpDefault).toBe('function');
    expect(typeof staticHttpNamed).toBe('function');

    // Verify self-referential properties for CJS/ESM interop fallback
    expect(https.HttpsProxyAgent.HttpsProxyAgent).toBe(https.HttpsProxyAgent);
    expect(https.HttpsProxyAgent.default).toBe(https.HttpsProxyAgent);
    expect(http.HttpProxyAgent.HttpProxyAgent).toBe(http.HttpProxyAgent);
    expect(http.HttpProxyAgent.default).toBe(http.HttpProxyAgent);

    // Verify they are constructable with proxy URLs
    expect(
      () => new https.HttpsProxyAgent('http://127.0.0.1:7897'),
    ).not.toThrow();
    expect(() => new https.default('http://127.0.0.1:7897')).not.toThrow();
    expect(() => new staticHttpsDefault('http://127.0.0.1:7897')).not.toThrow();
    expect(() => new staticHttpsNamed('http://127.0.0.1:7897')).not.toThrow();

    expect(
      () => new http.HttpProxyAgent('http://127.0.0.1:7897'),
    ).not.toThrow();
    expect(() => new http.default('http://127.0.0.1:7897')).not.toThrow();
    expect(() => new staticHttpDefault('http://127.0.0.1:7897')).not.toThrow();
    expect(() => new staticHttpNamed('http://127.0.0.1:7897')).not.toThrow();
  });

  it('instantiates proxy agents when HTTP_PROXY and HTTPS_PROXY are set', async () => {
    vi.stubEnv('HTTP_PROXY', 'http://127.0.0.1:7897');
    vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:7897');

    const entryFile = path.join(tmpDir, 'proxy-env-entry.ts');
    writeFileSync(
      entryFile,
      `
      export async function testEnvProxy() {
        const httpsMod = await import('https-proxy-agent');
        const httpMod = await import('http-proxy-agent');

        const httpsProxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
        const httpProxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;

        const httpsConstructor = httpsMod.HttpsProxyAgent || httpsMod.default || httpsMod;
        const httpConstructor = httpMod.HttpProxyAgent || httpMod.default || httpMod;

        const httpsAgent = new httpsConstructor(httpsProxyUrl);
        const httpAgent = new httpConstructor(httpProxyUrl);

        return { httpsAgent, httpAgent };
      }
      `,
    );

    await esbuild.build({
      entryPoints: { gemini: entryFile },
      outdir: path.join(tmpDir, 'bundle'),
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'node',
      outExtension: { '.js': '.mjs' },
      alias: {
        'https-proxy-agent': path.resolve(
          projectRoot,
          'packages/cli/src/patches/https-proxy-agent.ts',
        ),
        'http-proxy-agent': path.resolve(
          projectRoot,
          'packages/cli/src/patches/http-proxy-agent.ts',
        ),
      },
    });

    const bundledEntryUrl = pathToFileURL(
      path.join(tmpDir, 'bundle/gemini.mjs'),
    ).href;
    const { testEnvProxy } = await import(bundledEntryUrl);

    const { httpsAgent, httpAgent } = await testEnvProxy();
    expect(httpsAgent).toBeDefined();
    expect(httpAgent).toBeDefined();
    expect(httpsAgent.proxy?.href).toBe('http://127.0.0.1:7897/');
    expect(httpAgent.proxy?.href).toBe('http://127.0.0.1:7897/');
  });
});
