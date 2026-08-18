/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPackageJson } from '@google/gemini-cli-core';
import commandExists from 'command-exists';
import { loadSandboxConfig } from './sandboxConfig.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getPackageJson: vi.fn(),
  };
});

vi.mock('command-exists', () => {
  const sync = vi.fn();
  return {
    sync,
    default: { sync },
  };
});

const mockedGetPackageJson = vi.mocked(getPackageJson);
const mockedCommandExistsSync = vi.mocked(commandExists.sync);

describe('sandbox DEBUG environment normalization', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env['SANDBOX'];
    process.env['GEMINI_SANDBOX'] = 'docker';
    mockedCommandExistsSync.mockReturnValue(true);
    mockedGetPackageJson.mockResolvedValue({
      config: { sandboxImageUri: 'default/image' },
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it.each(['false', '0', 'off', 'anything']) (
    'removes unsupported DEBUG value %s before launching a sandbox',
    async (debugValue) => {
      process.env['DEBUG'] = debugValue;

      const config = await loadSandboxConfig({}, {});

      expect(config?.command).toBe('docker');
      expect(process.env['DEBUG']).toBeUndefined();
    },
  );

  it.each(['true', '1']) (
    'preserves supported DEBUG value %s for the sandbox launcher',
    async (debugValue) => {
      process.env['DEBUG'] = debugValue;

      const config = await loadSandboxConfig({}, {});

      expect(config?.command).toBe('docker');
      expect(process.env['DEBUG']).toBe(debugValue);
    },
  );

  it('does not alter DEBUG when sandboxing is disabled', async () => {
    delete process.env['GEMINI_SANDBOX'];
    process.env['DEBUG'] = 'false';

    const config = await loadSandboxConfig({}, { sandbox: false });

    expect(config).toBeUndefined();
    expect(process.env['DEBUG']).toBe('false');
  });
});
