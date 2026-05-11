/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingScope } from '../../config/settings.js';
import { getLiteRtBinDir } from './constants.js';

const mockLoadSettings = vi.hoisted(() => vi.fn());

vi.mock('../../config/settings.js', () => ({
  loadSettings: mockLoadSettings,
  SettingScope: {
    User: 'User',
  },
}));

import {
  getBinaryPath,
  isExpectedLiteRtServerCommand,
  isBinaryInstalled,
  readServerProcessInfo,
  resolveGemmaConfig,
} from './platform.js';

describe('gemma platform helpers', () => {
  function createMockSettings(
    userGemmaSettings?: object,
    mergedGemmaSettings?: object,
  ) {
    return {
      merged: {
        experimental: {
          gemmaModelRouter: mergedGemmaSettings,
        },
      },
      forScope: vi.fn((scope: SettingScope) => {
        if (scope !== SettingScope.User) {
          throw new Error(`Unexpected scope ${scope}`);
        }
        return {
          settings: {
            experimental: {
              gemmaModelRouter: userGemmaSettings,
            },
          },
        };
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadSettings.mockReturnValue(createMockSettings());
  });

  it('prefers the configured binary path from settings', () => {
    mockLoadSettings.mockReturnValue(
      createMockSettings({ binaryPath: '/custom/lit' }),
    );

    expect(getBinaryPath('lit.test')).toBe('/custom/lit');
  });

  it('ignores workspace overrides for the configured binary path', () => {
    mockLoadSettings.mockReturnValue(
      createMockSettings(
        { binaryPath: '/user/lit' },
        { binaryPath: '/workspace/evil' },
      ),
    );

    expect(getBinaryPath('lit.test')).toBe('/user/lit');
  });

  it('falls back to the default install location when no custom path is set', () => {
    expect(getBinaryPath('lit.test')).toBe(
      path.join(getLiteRtBinDir(), 'lit.test'),
    );
  });

  it('resolves the configured port and binary path from settings', () => {
    mockLoadSettings.mockReturnValue(
      createMockSettings(
        { binaryPath: '/custom/lit' },
        {
          enabled: true,
          classifier: {
            host: 'http://localhost:8123/v1beta',
          },
        },
      ),
    );

    expect(resolveGemmaConfig(9379)).toEqual({
      settingsEnabled: true,
      configuredPort: 8123,
      configuredBinaryPath: '/custom/lit',
    });
  });

  it('checks binary installation using the resolved binary path', () => {
    mockLoadSettings.mockReturnValue(
      createMockSettings({ binaryPath: '/custom/lit' }),
    );
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    expect(isBinaryInstalled()).toBe(true);
    expect(fs.existsSync).toHaveBeenCalledWith('/custom/lit');
  });

  it('parses structured server process info from the pid file', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        pid: 1234,
        binaryPath: '/custom/lit',
        port: 8123,
      }),
    );

    expect(readServerProcessInfo()).toEqual({
      pid: 1234,
      binaryPath: '/custom/lit',
      port: 8123,
    });
  });

  it('parses legacy pid-only files for backward compatibility', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('4321');

    expect(readServerProcessInfo()).toEqual({
      pid: 4321,
    });
  });

  it('matches only the expected LiteRT serve command', () => {
    expect(
      isExpectedLiteRtServerCommand('/custom/lit serve --port=8123 --verbose', {
        binaryPath: '/custom/lit',
        port: 8123,
      }),
    ).toBe(true);

    expect(
      isExpectedLiteRtServerCommand('/custom/lit run --port=8123', {
        binaryPath: '/custom/lit',
        port: 8123,
      }),
    ).toBe(false);

    expect(
      isExpectedLiteRtServerCommand('/custom/lit serve --port=9000', {
        binaryPath: '/custom/lit',
        port: 8123,
      }),
    ).toBe(false);
  });
});
