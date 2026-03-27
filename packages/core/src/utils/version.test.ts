/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVersion, resetVersionCache } from './version.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('version', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetVersionCache();
    process.env = { ...originalEnv };
    vi.mocked(readFile).mockResolvedValue('{"version":"1.0.0"}');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return CLI_VERSION from env if set', async () => {
    process.env['CLI_VERSION'] = '2.0.0';
    const version = await getVersion();
    expect(version).toBe('2.0.0');
  });

  it('should return version from package.json if CLI_VERSION is not set', async () => {
    delete process.env['CLI_VERSION'];
    const version = await getVersion();
    expect(version).toBe('1.0.0');
  });

  it('should return "unknown" if package.json is not found and CLI_VERSION is not set', async () => {
    delete process.env['CLI_VERSION'];
    vi.mocked(readFile).mockRejectedValue(new Error('not found'));
    const version = await getVersion();
    expect(version).toBe('unknown');
  });

  it('prefers the repository package version when running from source', async () => {
    delete process.env['CLI_VERSION'];
    vi.mocked(readFile).mockImplementation(async (filePath) => {
      const normalizedPath = String(filePath).replace(/\\/g, '/');
      if (normalizedPath.endsWith('/packages/core/package.json')) {
        return '{"name":"@google/gemini-cli-core","version":"0.35.0"}';
      }
      if (
        normalizedPath.endsWith('/gemini-cli-work/package.json') ||
        normalizedPath.endsWith('/gemini-cli/package.json')
      ) {
        return '{"name":"@google/gemini-cli","version":"0.36.0"}';
      }
      throw new Error('not found');
    });

    const version = await getVersion();

    expect(version).toBe('0.36.0');
    expect(vi.mocked(readFile)).toHaveBeenCalledWith(
      expect.stringContaining(
        ['packages', 'core', 'package.json'].join(path.sep),
      ),
      'utf8',
    );
  });

  it('should cache the version and only call readFile once', async () => {
    delete process.env['CLI_VERSION'];
    vi.mocked(readFile).mockResolvedValue('{"version":"1.2.3"}');

    const version1 = await getVersion();
    expect(version1).toBe('1.2.3');
    const callsAfterFirstLookup = vi.mocked(readFile).mock.calls.length;
    expect(callsAfterFirstLookup).toBeGreaterThan(0);

    // Change the mock value to simulate an update on disk
    vi.mocked(readFile).mockResolvedValue('{"version":"2.0.0"}');

    const version2 = await getVersion();
    expect(version2).toBe('1.2.3'); // Should still be the cached version
    expect(readFile).toHaveBeenCalledTimes(callsAfterFirstLookup);
  });
});
