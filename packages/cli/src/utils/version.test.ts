/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCliVersion } from './version.js';
import * as core from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', () => ({
  getPackageJson: vi.fn(),
}));

describe('version', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.mocked(core.getPackageJson).mockResolvedValue({ version: '1.0.0' });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return CLI_VERSION from env if set', async () => {
    process.env['CLI_VERSION'] = '2.0.0';
    const version = await getCliVersion();
    expect(version).toBe('2.0.0');
  });

  it('should return version from package.json if CLI_VERSION is not set', async () => {
    delete process.env['CLI_VERSION'];
    const version = await getCliVersion();
    expect(version).toBe('1.0.0');
  });

  it('should return "unknown" if package.json is not found and CLI_VERSION is not set', async () => {
    delete process.env['CLI_VERSION'];
    vi.mocked(core.getPackageJson).mockResolvedValue(undefined);
    const version = await getCliVersion();
    expect(version).toBe('unknown');
  });
});
