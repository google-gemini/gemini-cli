/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const originalGeminiCliHome = process.env['GEMINI_CLI_HOME'];

afterEach(() => {
  if (originalGeminiCliHome === undefined) {
    delete process.env['GEMINI_CLI_HOME'];
  } else {
    process.env['GEMINI_CLI_HOME'] = originalGeminiCliHome;
  }
});

describe('telemetry_utils', () => {
  it('imports without runtime reference errors', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'telemetry-utils-'));
    process.env['GEMINI_CLI_HOME'] = tempRoot;

    try {
      const moduleUrl =
        pathToFileURL(path.join(repoRoot, 'scripts', 'telemetry_utils.js'))
          .href + `?t=${Date.now()}`;
      const mod = await import(moduleUrl);

      expect(mod.OTEL_DIR).toContain(path.join(tempRoot, '.gemini'));
      expect(
        mod.WORKSPACE_SETTINGS_FILE.endsWith(
          path.join('.gemini', 'settings.json'),
        ),
      ).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
