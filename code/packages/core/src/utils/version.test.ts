/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getVersion, resetVersionCache } from './version.js';
import { getPackageJson } from './package.js';

vi.mock('./package.js', () => ({
  getPackageJson: vi.fn(),
}));

describe('version', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetVersionCache();
    process.env = { ...originalEnv };
    vi.mocked(getPackageJson).mockResolvedValue({ version: '1.0.0' });
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
    vi.mocked(getPackageJson).mockResolvedValue(undefined);
    const version = await getVersion();
    expect(version).toBe('unknown');
  });

  it('should cache the version and only call getPackageJson once', async () => {
    delete process.env['CLI_VERSION'];
    vi.mocked(getPackageJson).mockResolvedValue({ version: '1.2.3' });

    const version1 = await getVersion();
    expect(version1).toBe('1.2.3');
    expect(getPackageJson).toHaveBeenCalledTimes(1);

    // Change the mock value to simulate an update on disk
    vi.mocked(getPackageJson).mockResolvedValue({ version: '2.0.0' });

    const version2 = await getVersion();
    expect(version2).toBe('1.2.3'); // Should still be the cached version
    expect(getPackageJson).toHaveBeenCalledTimes(1); // Should not have been called again
  });
});
