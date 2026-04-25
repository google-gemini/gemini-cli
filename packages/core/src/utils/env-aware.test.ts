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
import os from 'node:os';
import {
  getShellConfiguration,
  getEnvironmentAwareCommand,
} from './shell-utils.js';

vi.mock('node:os');

const mockPlatform = os.platform as Mock;

describe('getEnvironmentAwareCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should not change command on non-Windows', () => {
    mockPlatform.mockReturnValue('linux');
    expect(getEnvironmentAwareCommand('ls -la')).toBe('ls -la');
    expect(getEnvironmentAwareCommand('cat file.txt')).toBe('cat file.txt');
  });

  describe('on Windows with PowerShell', () => {
    beforeEach(() => {
      mockPlatform.mockReturnValue('win32');
    });

    it('should map ls and cat to their aliases/equivalents', () => {
      expect(getEnvironmentAwareCommand('ls', 'powershell')).toBe('ls');
      expect(getEnvironmentAwareCommand('ls -la', 'powershell')).toBe('ls -la');
      expect(getEnvironmentAwareCommand('cat file.txt', 'powershell')).toBe(
        'cat file.txt',
      );
    });

    it('should map rm -rf to PowerShell flags', () => {
      expect(getEnvironmentAwareCommand('rm -rf folder', 'powershell')).toBe(
        'rm -Recurse -Force folder',
      );
      expect(getEnvironmentAwareCommand('rm -f file', 'powershell')).toBe(
        'rm -Force file',
      );
      expect(getEnvironmentAwareCommand('rm -r folder', 'powershell')).toBe(
        'rm -Recurse folder',
      );
    });

    it('should map mkdir -p to mkdir', () => {
      expect(
        getEnvironmentAwareCommand('mkdir -p path/to/dir', 'powershell'),
      ).toBe('mkdir path/to/dir');
    });

    it('should map cp -r to Copy-Item flags', () => {
      expect(getEnvironmentAwareCommand('cp -r src dest', 'powershell')).toBe(
        'cp -Recurse src dest',
      );
    });

    it('should map touch to New-Item', () => {
      expect(
        getEnvironmentAwareCommand('touch newfile.txt', 'powershell'),
      ).toBe('New-Item -ItemType File -Force newfile.txt');
    });

    it('should map which to Get-Command', () => {
      expect(getEnvironmentAwareCommand('which git', 'powershell')).toBe(
        'Get-Command git',
      );
    });

    it('should map /dev/null to $null', () => {
      expect(
        getEnvironmentAwareCommand('echo hello > /dev/null', 'powershell'),
      ).toBe('echo hello > $null');
      expect(getEnvironmentAwareCommand('cat /dev/null', 'powershell')).toBe(
        'cat $null',
      );
    });

    it('should map && and || to PowerShell equivalents for compatibility', () => {
      expect(
        getEnvironmentAwareCommand('npm install && npm test', 'powershell'),
      ).toBe('npm install; if ($?) { npm test }');
      expect(
        getEnvironmentAwareCommand('git commit || echo error', 'powershell'),
      ).toBe('git commit; if (-not $?) { echo error }');
      expect(getEnvironmentAwareCommand('a && b || c', 'powershell')).toBe(
        'a; if ($?) { b; if (-not $?) { c } }',
      );
    });
  });

  describe('on Windows with CMD', () => {
    beforeEach(() => {
      mockPlatform.mockReturnValue('win32');
    });

    it('should map ls to dir and cat to type', () => {
      expect(getEnvironmentAwareCommand('ls', 'cmd')).toBe('dir');
      expect(getEnvironmentAwareCommand('cat file.txt', 'cmd')).toBe(
        'type file.txt',
      );
    });

    it('should map /dev/null to nul', () => {
      expect(getEnvironmentAwareCommand('echo hello > /dev/null', 'cmd')).toBe(
        'echo hello > nul',
      );
    });

    it('should map touch to type nul >', () => {
      expect(getEnvironmentAwareCommand('touch file.txt', 'cmd')).toBe(
        'type nul > file.txt',
      );
    });

    it('should map which to where', () => {
      expect(getEnvironmentAwareCommand('which git', 'cmd')).toBe('where git');
    });
  });
});

describe('getShellConfiguration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should include defaultPager', () => {
    mockPlatform.mockReturnValue('linux');
    const config = getShellConfiguration();
    expect(config.defaultPager).toBe('cat');

    mockPlatform.mockReturnValue('win32');
    const winConfig = getShellConfiguration();
    expect(winConfig.defaultPager).toBe('');
  });
});
