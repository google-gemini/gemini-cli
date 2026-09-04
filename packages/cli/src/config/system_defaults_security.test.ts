/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof import('node:os')>();
  return {
    ...actualOs,
    platform: vi.fn(() => 'linux'),
  };
});

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('node:fs')>();
  return {
    ...actualFs,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    isPathSecureSync: vi.fn(actual.isPathSecureSync),
  };
});

import * as core from '@google/gemini-cli-core';
import {
  loadSettings,
  getSystemSettingsPath,
  getSystemDefaultsPath,
  resetSettingsCacheForTesting,
} from './settings.js';

describe('System configuration security validation', () => {
  const mockSystemDefaultsPath = path.resolve(
    '/mock/system/system-defaults.json',
  );
  const mockSystemSettingsPath = path.resolve('/mock/system/settings.json');
  let feedbackSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    resetSettingsCacheForTesting();
    core.clearSecurityCheckCacheForTesting();

    vi.stubEnv('GEMINI_CLI_SYSTEM_DEFAULTS_PATH', mockSystemDefaultsPath);
    vi.stubEnv('GEMINI_CLI_SYSTEM_SETTINGS_PATH', mockSystemSettingsPath);

    (fs.existsSync as unknown as Mock).mockReturnValue(false);
    (fs.readFileSync as unknown as Mock).mockReturnValue('{}');
    (os.platform as unknown as Mock).mockReturnValue('linux');
    (core.isPathSecureSync as unknown as Mock).mockReturnValue({
      secure: true,
    });

    feedbackSpy = vi.spyOn(core.coreEvents, 'emitFeedback');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    core.clearSecurityCheckCacheForTesting();
  });

  it('skips system-defaults.json when path security check fails', () => {
    (fs.existsSync as unknown as Mock).mockImplementation((p: string) => {
      if (p === mockSystemDefaultsPath) return true;
      return false;
    });

    (fs.readFileSync as unknown as Mock).mockImplementation((p: string) => {
      if (p === mockSystemDefaultsPath) {
        return JSON.stringify({
          general: { enableAutoUpdate: false },
        });
      }
      return '{}';
    });

    (core.isPathSecureSync as unknown as Mock).mockImplementation(
      (targetPath: string) => {
        if (targetPath === mockSystemDefaultsPath) {
          return {
            secure: false,
            reason: 'Path owner is not an administrator',
          };
        }
        return { secure: true };
      },
    );

    const loadedSettings = loadSettings('/mock/workspace');

    expect(loadedSettings.systemDefaults.settings).toEqual({});
    expect(loadedSettings.merged.general?.enableAutoUpdate).toBe(true);

    expect(feedbackSpy).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining(
        `Skipping system default configuration file ${mockSystemDefaultsPath} due to insecure permissions`,
      ),
    );

    const securityError = loadedSettings.errors.find(
      (err) => err.path === mockSystemDefaultsPath,
    );
    expect(securityError).toBeDefined();
    expect(securityError?.severity).toBe('warning');
  });

  it('skips system settings.json when path security check fails', () => {
    (fs.existsSync as unknown as Mock).mockImplementation((p: string) => {
      if (p === mockSystemSettingsPath) return true;
      return false;
    });

    (fs.readFileSync as unknown as Mock).mockImplementation((p: string) => {
      if (p === mockSystemSettingsPath) {
        return JSON.stringify({
          general: { enableAutoUpdate: false },
        });
      }
      return '{}';
    });

    (core.isPathSecureSync as unknown as Mock).mockImplementation(
      (targetPath: string) => {
        if (targetPath === mockSystemSettingsPath) {
          return {
            secure: false,
            reason: 'User groups have write permissions',
          };
        }
        return { secure: true };
      },
    );

    const loadedSettings = loadSettings('/mock/workspace');

    expect(loadedSettings.system.settings).toEqual({});
    expect(loadedSettings.merged.general?.enableAutoUpdate).toBe(true);

    expect(feedbackSpy).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining(
        `Skipping system configuration file ${mockSystemSettingsPath} due to insecure permissions`,
      ),
    );

    const securityError = loadedSettings.errors.find(
      (err) => err.path === mockSystemSettingsPath,
    );
    expect(securityError).toBeDefined();
    expect(securityError?.severity).toBe('warning');
  });

  it('loads system defaults successfully when path is secure', () => {
    (fs.existsSync as unknown as Mock).mockImplementation((p: string) => {
      if (p === mockSystemDefaultsPath) return true;
      return false;
    });

    (fs.readFileSync as unknown as Mock).mockImplementation((p: string) => {
      if (p === mockSystemDefaultsPath) {
        return JSON.stringify({
          general: { enableAutoUpdate: false },
        });
      }
      return '{}';
    });

    (core.isPathSecureSync as unknown as Mock).mockReturnValue({
      secure: true,
    });

    const loadedSettings = loadSettings('/mock/workspace');

    expect(
      loadedSettings.systemDefaults.settings.general?.enableAutoUpdate,
    ).toBe(false);
    expect(loadedSettings.merged.general?.enableAutoUpdate).toBe(false);
    expect(feedbackSpy).not.toHaveBeenCalled();
  });

  it('handles non-existent system configuration files gracefully', () => {
    (fs.existsSync as unknown as Mock).mockReturnValue(false);

    const loadedSettings = loadSettings('/mock/workspace');

    expect(loadedSettings.systemDefaults.settings).toEqual({});
    expect(loadedSettings.system.settings).toEqual({});
    expect(core.isPathSecureSync).not.toHaveBeenCalled();
    expect(feedbackSpy).not.toHaveBeenCalled();
  });

  it('resolves Windows system defaults path correctly on win32 platform', () => {
    vi.unstubAllEnvs();
    (os.platform as unknown as Mock).mockReturnValue('win32');

    const expectedPath = 'C:\\ProgramData\\gemini-cli\\system-defaults.json';
    expect(getSystemDefaultsPath()).toBe(expectedPath);
    expect(getSystemSettingsPath()).toBe(
      'C:\\ProgramData\\gemini-cli\\settings.json',
    );
  });
});
