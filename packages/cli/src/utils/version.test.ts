/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getCliVersion } from './version.js';
import * as packageModule from './package.js';

vi.mock('./package.js');

describe('getCliVersion', () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return CLI_VERSION from environment variable when set', async () => {
    process.env['CLI_VERSION'] = '1.2.3-test';
    vi.mocked(packageModule.getPackageJson).mockResolvedValue({
      version: '0.0.0',
    } as never);

    const version = await getCliVersion();
    expect(version).toBe('1.2.3-test');
  });

  it('should return package.json version when CLI_VERSION is not set', async () => {
    delete process.env['CLI_VERSION'];
    vi.mocked(packageModule.getPackageJson).mockResolvedValue({
      version: '2.3.4',
    } as never);

    const version = await getCliVersion();
    expect(version).toBe('2.3.4');
  });

  it('should return "unknown" when both CLI_VERSION and package.json version are unavailable', async () => {
    delete process.env['CLI_VERSION'];
    vi.mocked(packageModule.getPackageJson).mockResolvedValue(null);

    const version = await getCliVersion();
    expect(version).toBe('unknown');
  });

  it('should return "unknown" when package.json has no version field', async () => {
    delete process.env['CLI_VERSION'];
    vi.mocked(packageModule.getPackageJson).mockResolvedValue({} as never);

    const version = await getCliVersion();
    expect(version).toBe('unknown');
  });

  it('should prioritize CLI_VERSION over package.json version', async () => {
    process.env['CLI_VERSION'] = '5.6.7';
    vi.mocked(packageModule.getPackageJson).mockResolvedValue({
      version: '1.0.0',
    } as never);

    const version = await getCliVersion();
    expect(version).toBe('5.6.7');
  });

  it('should handle empty string CLI_VERSION', async () => {
    process.env['CLI_VERSION'] = '';
    vi.mocked(packageModule.getPackageJson).mockResolvedValue({
      version: '1.0.0',
    } as never);

    const version = await getCliVersion();
    expect(version).toBe('1.0.0');
  });

  it('should be async and return a promise', () => {
    const result = getCliVersion();
    expect(result).toBeInstanceOf(Promise);
  });
});
