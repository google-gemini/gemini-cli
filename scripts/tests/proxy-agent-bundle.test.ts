/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
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

describe('proxy-agent bundle shape', () => {
  it('preserves named constructors after ESM splitting', async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'gemini-proxy-test-'));
    const entryFile = path.join(tmpDir, 'entry.ts');

    // Create a minimal entry file that dynamically imports the proxy agents
    writeFileSync(
      entryFile,
      `
      export async function getAgents() {
        const httpsMod = await import('https-proxy-agent');
        const httpMod = await import('http-proxy-agent');
        return {
          https: httpsMod,
          http: httpMod,
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

    const { https, http } = await getAgents();

    // Verify named exports exist
    expect(typeof https.HttpsProxyAgent).toBe('function');
    expect(typeof http.HttpProxyAgent).toBe('function');

    // Verify they are constructable
    expect(() => new https.HttpsProxyAgent('http://127.0.0.1:9')).not.toThrow();
    expect(() => new http.HttpProxyAgent('http://127.0.0.1:9')).not.toThrow();

    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
