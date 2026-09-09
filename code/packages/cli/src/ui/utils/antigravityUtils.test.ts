/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAntigravityInstallInfo } from './antigravityUtils.js';

describe('antigravityUtils', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.unstubAllEnvs();
  });

  it('should return macOS installation info on darwin platform', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const info = getAntigravityInstallInfo();

    expect(info).toEqual({
      platformName: 'macOS',
      installCmd: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    });
  });

  it('should return Linux installation info on linux platform', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });

    const info = getAntigravityInstallInfo();

    expect(info).toEqual({
      platformName: 'Linux',
      installCmd: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    });
  });

  it('should return Windows PowerShell installation info on win32 when PSModulePath is set', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.stubEnv('PSModulePath', 'C:\\some\\path');

    const info = getAntigravityInstallInfo();

    expect(info).toEqual({
      platformName: 'Windows (PowerShell)',
      installCmd: 'irm https://antigravity.google/cli/install.ps1 | iex',
    });
  });

  it('should return Windows CMD installation info on win32 when PSModulePath is not set', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.stubEnv('PSModulePath', '');

    const info = getAntigravityInstallInfo();

    expect(info).toEqual({
      platformName: 'Windows (Command Prompt)',
      installCmd:
        'curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd',
    });
  });

  it('should return null on unsupported platform', () => {
    Object.defineProperty(process, 'platform', { value: 'freebsd' });

    const info = getAntigravityInstallInfo();

    expect(info).toBeNull();
  });
});
