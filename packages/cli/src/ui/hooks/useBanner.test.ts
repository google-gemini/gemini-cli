/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useBanner, _clearSessionBannersForTest } from './useBanner.js';
import { persistentState } from '../../utils/persistentState.js';
import crypto from 'node:crypto';
import chalk from 'chalk';

vi.mock('../../utils/persistentState.js', () => ({
  persistentState: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../semantic-colors.js', () => ({
  theme: {
    status: {
      warning: 'mock-warning-color',
    },
    ui: {
      focus: 'mock-focus-color',
    },
  },
}));

vi.mock('../colors.js', () => ({
  Colors: {
    AccentBlue: 'mock-accent-blue',
  },
}));

const mockGetAntigravityCompatibility = vi.fn();
vi.mock('../utils/antigravityUtils.js', async () => {
  const actual = await vi.importActual<
    typeof import('../utils/antigravityUtils.js')
  >('../utils/antigravityUtils.js');
  return {
    ...actual,
    getAntigravityCompatibility: () => mockGetAntigravityCompatibility(),
  };
});

describe('useBanner', () => {
  const mockedPersistentStateGet = persistentState.get as MockedFunction<
    typeof persistentState.get
  >;
  const mockedPersistentStateSet = persistentState.set as MockedFunction<
    typeof persistentState.set
  >;

  const defaultBannerData = {
    defaultText: 'Standard Banner',
    warningText: '',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    _clearSessionBannersForTest();

    // Default persistentState behavior: return empty object (no counts)
    mockedPersistentStateGet.mockReturnValue({});
  });

  it('should return warning text and warning color if warningText is present', async () => {
    const data = { defaultText: 'Standard', warningText: 'Critical Error' };

    const { result } = await renderHook(() => useBanner(data));

    expect(result.current.bannerText).toBe('Critical Error');
  });

  it('should hide banner if show count exceeds max limit (Legacy format)', async () => {
    mockedPersistentStateGet.mockReturnValue({
      [crypto
        .createHash('sha256')
        .update(defaultBannerData.defaultText)
        .digest('hex')]: 5,
    });
  });

  it('should not hide banner if show count exceeds max limit (Legacy format) if it contains an Antigravity announcement', async () => {
    const antigravityBannerData = {
      defaultText: 'Antigravity is coming to town!',
      warningText: '',
    };

    mockGetAntigravityCompatibility.mockReturnValue({
      installInfo: { platformName: 'Linux', installCmd: 'curl ...' },
      cpuCompatible: true,
      incompatibilityReason: '',
    });

    mockedPersistentStateGet.mockReturnValue({
      [crypto
        .createHash('sha256')
        .update(antigravityBannerData.defaultText)
        .digest('hex')]: 5,
    });

    const { result } = await renderHook(() => useBanner(antigravityBannerData));

    expect(result.current.bannerText).toContain(
      'Antigravity is coming to town!',
    );
  });

  it('should increment the persistent count when banner is shown', async () => {
    const data = { defaultText: 'Tracker', warningText: '' };

    // Current count is 1
    mockedPersistentStateGet.mockReturnValue({
      [crypto.createHash('sha256').update(data.defaultText).digest('hex')]: 1,
    });

    await renderHook(() => useBanner(data));

    // Expect set to be called with incremented count
    expect(mockedPersistentStateSet).toHaveBeenCalledWith(
      'defaultBannerShownCount',
      {
        [crypto.createHash('sha256').update(data.defaultText).digest('hex')]: 2,
      },
    );
  });

  it('should increment count if warning text is shown instead', async () => {
    const data = { defaultText: 'Standard', warningText: 'Warning' };

    await renderHook(() => useBanner(data));

    // Warning text now also gets counted
    expect(mockedPersistentStateSet).toHaveBeenCalledWith(
      'defaultBannerShownCount',
      {
        [crypto.createHash('sha256').update(data.warningText).digest('hex')]: 1,
      },
    );
  });

  it('should handle newline replacements', async () => {
    const data = { defaultText: 'Line1\\nLine2', warningText: '' };

    const { result } = await renderHook(() => useBanner(data));

    expect(result.current.bannerText).toBe('Line1\nLine2');
  });

  describe('Antigravity installation commands', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      mockGetAntigravityCompatibility.mockReset();
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      vi.unstubAllEnvs();
    });

    it('should append macOS & Linux install command when on compatible darwin', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: {
          platformName: 'macOS',
          installCmd:
            'curl -fsSL https://antigravity.google/cli/install.sh | bash',
        },
        cpuCompatible: true,
        incompatibilityReason: '',
      });
      const data = { defaultText: 'Welcome to Antigravity!', warningText: '' };

      const { result } = await renderHook(() => useBanner(data));

      expect(result.current.bannerText).toBe(
        `Welcome to Antigravity!\n \nTo install run "${chalk.bold('curl -fsSL https://antigravity.google/cli/install.sh | bash')}"`,
      );
    });

    it('should append macOS & Linux install command when on compatible linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: {
          platformName: 'Linux',
          installCmd:
            'curl -fsSL https://antigravity.google/cli/install.sh | bash',
        },
        cpuCompatible: true,
        incompatibilityReason: '',
      });
      const data = { defaultText: 'Welcome to Antigravity!', warningText: '' };

      const { result } = await renderHook(() => useBanner(data));

      expect(result.current.bannerText).toBe(
        `Welcome to Antigravity!\n \nTo install run "${chalk.bold('curl -fsSL https://antigravity.google/cli/install.sh | bash')}"`,
      );
    });

    it('should append Windows PowerShell install command when on compatible win32 and PSModulePath is set', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('PSModulePath', 'C:\\some\\path');
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: {
          platformName: 'Windows (PowerShell)',
          installCmd: 'irm https://antigravity.google/cli/install.ps1 | iex',
        },
        cpuCompatible: true,
        incompatibilityReason: '',
      });
      const data = { defaultText: 'Welcome to Antigravity!', warningText: '' };

      const { result } = await renderHook(() => useBanner(data));

      expect(result.current.bannerText).toBe(
        `Welcome to Antigravity!\n \nTo install run "${chalk.bold('irm https://antigravity.google/cli/install.ps1 | iex')}"`,
      );
    });

    it('should append Windows CMD install command when on compatible win32 and PSModulePath is not set', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.stubEnv('PSModulePath', '');
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: {
          platformName: 'Windows (Command Prompt)',
          installCmd:
            'curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd',
        },
        cpuCompatible: true,
        incompatibilityReason: '',
      });
      const data = { defaultText: 'Welcome to Antigravity!', warningText: '' };

      const { result } = await renderHook(() => useBanner(data));

      expect(result.current.bannerText).toBe(
        `Welcome to Antigravity!\n \nTo install run "${chalk.bold('curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd')}"`,
      );
    });

    it('should not append install command if banner text does not contain Antigravity', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const data = { defaultText: 'Regular Banner', warningText: '' };

      const { result } = await renderHook(() => useBanner(data));

      expect(result.current.bannerText).toBe('Regular Banner');
    });

    it('should not append install command if process.platform is an unsupported platform', async () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: null,
        cpuCompatible: true,
        incompatibilityReason: '',
      });
      const data = { defaultText: 'Welcome to Antigravity!', warningText: '' };

      const { result } = await renderHook(() => useBanner(data));

      expect(result.current.bannerText).toBe('Welcome to Antigravity!');
    });

    it('should show CPU incompatibility warning instead of install command for legacy CPUs (issue #27342)', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockGetAntigravityCompatibility.mockReturnValue({
        installInfo: {
          platformName: 'Linux',
          installCmd:
            'curl -fsSL https://antigravity.google/cli/install.sh | bash',
        },
        cpuCompatible: false,
        incompatibilityReason:
          'Your CPU (AMD A6-3420M APU) lacks required instruction sets: AVX, AVX2. ' +
          'Detected microarchitecture: x86-64-v2. ' +
          'The Antigravity CLI requires x86-64-v3 (AVX2) and will crash with ' +
          '"Illegal instruction" (SIGILL, exit code 132) on this hardware.',
      });
      const data = { defaultText: 'Welcome to Antigravity!', warningText: '' };

      const { result } = await renderHook(() => useBanner(data));

      expect(result.current.bannerText).toContain(
        'Your CPU is not compatible with the Antigravity CLI binary',
      );
      expect(result.current.bannerText).toContain('AMD A6-3420M');
      expect(result.current.bannerText).toContain('continue using Gemini CLI');
      // Should NOT contain the install command
      expect(result.current.bannerText).not.toContain('To install run');
    });
  });
});
