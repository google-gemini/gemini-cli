/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createProfile,
  deleteProfile,
  grantFileAccess,
  revokeFileAccess,
  listProfiles,
} from '../appContainerProfile.js';
import type { AppContainerProfile } from '../appContainerProfile.js';
import { AppContainerCapability } from '../appContainerCapabilities.js';
import * as childProcess from 'node:child_process';

// Mock child_process so we never call real PowerShell / icacls
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(childProcess.execSync);

describe('appContainerProfile', () => {
  const originalPlatform = process.platform;

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value: platform });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('createProfile', () => {
    it('should return a stub profile on non-Windows', async () => {
      setPlatform('linux');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const profile = await createProfile('test-profile');

      expect(profile.name).toBe('test-profile');
      expect(profile.sid).toBe('S-0-0-0');
      expect(profile.capabilities).toEqual([]);
      expect(profile.allowedPaths).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('only supported on Windows'),
      );

      warnSpy.mockRestore();
    });

    it('should call PowerShell to create and query profile on Windows', async () => {
      setPlatform('win32');

      // First call: New-AppContainerProfile
      // Second call: Get SID
      mockedExecSync
        .mockReturnValueOnce('') // create
        .mockReturnValueOnce('S-1-15-2-12345') as unknown; // get SID

      const profile = await createProfile('test-profile', [
        AppContainerCapability.InternetClient,
      ]);

      expect(profile.name).toBe('test-profile');
      expect(profile.sid).toBe('S-1-15-2-12345');
      expect(profile.capabilities).toEqual([
        AppContainerCapability.InternetClient,
      ]);
      expect(profile.allowedPaths).toEqual([]);
      expect(mockedExecSync).toHaveBeenCalledTimes(2);

      // Verify PowerShell create command includes profile name
      const createCall = mockedExecSync.mock.calls[0][0];
      expect(createCall).toContain('New-AppContainerProfile');
      expect(createCall).toContain('test-profile');
      expect(createCall).toContain('internetClient');

      // Verify SID query
      const sidCall = mockedExecSync.mock.calls[1][0];
      expect(sidCall).toContain('Get-AppContainerProfile');
      expect(sidCall).toContain('test-profile');
    });
  });

  describe('deleteProfile', () => {
    it('should be a no-op on non-Windows', async () => {
      setPlatform('darwin');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await deleteProfile('test-profile');

      expect(mockedExecSync).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should call Remove-AppContainerProfile on Windows', async () => {
      setPlatform('win32');
      mockedExecSync.mockReturnValueOnce('');

      await deleteProfile('test-profile');

      expect(mockedExecSync).toHaveBeenCalledTimes(1);
      const cmd = mockedExecSync.mock.calls[0][0];
      expect(cmd).toContain('Remove-AppContainerProfile');
      expect(cmd).toContain('test-profile');
    });

    it('should not throw if profile does not exist', async () => {
      setPlatform('win32');
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error('Profile not found');
      });

      await expect(deleteProfile('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('grantFileAccess', () => {
    const profile: AppContainerProfile = {
      name: 'test',
      sid: 'S-1-15-2-99999',
      capabilities: [],
      allowedPaths: [],
    };

    it('should be a no-op on non-Windows', async () => {
      setPlatform('linux');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await grantFileAccess(profile, ['C:\\project']);

      expect(mockedExecSync).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should call icacls to grant access on Windows', async () => {
      setPlatform('win32');
      mockedExecSync.mockReturnValue('');

      const p: AppContainerProfile = { ...profile, allowedPaths: [] };
      await grantFileAccess(p, ['C:\\project', 'C:\\data']);

      expect(mockedExecSync).toHaveBeenCalledTimes(2);

      const cmd1 = mockedExecSync.mock.calls[0][0];
      expect(cmd1).toContain('icacls');
      expect(cmd1).toContain('C:\\project');
      expect(cmd1).toContain(profile.sid);

      expect(p.allowedPaths).toContain('C:\\project');
      expect(p.allowedPaths).toContain('C:\\data');
    });

    it('should not duplicate paths in allowedPaths', async () => {
      setPlatform('win32');
      mockedExecSync.mockReturnValue('');

      const p: AppContainerProfile = {
        ...profile,
        allowedPaths: ['C:\\project'],
      };
      await grantFileAccess(p, ['C:\\project']);

      expect(p.allowedPaths.filter((x) => x === 'C:\\project')).toHaveLength(1);
    });
  });

  describe('revokeFileAccess', () => {
    it('should be a no-op on non-Windows', async () => {
      setPlatform('darwin');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const p: AppContainerProfile = {
        name: 'test',
        sid: 'S-1-15-2-99999',
        capabilities: [],
        allowedPaths: ['C:\\project'],
      };

      await revokeFileAccess(p, ['C:\\project']);

      expect(mockedExecSync).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should call icacls to remove access on Windows', async () => {
      setPlatform('win32');
      mockedExecSync.mockReturnValue('');

      const p: AppContainerProfile = {
        name: 'test',
        sid: 'S-1-15-2-99999',
        capabilities: [],
        allowedPaths: ['C:\\project'],
      };
      await revokeFileAccess(p, ['C:\\project']);

      expect(mockedExecSync).toHaveBeenCalledTimes(1);
      const cmd = mockedExecSync.mock.calls[0][0];
      expect(cmd).toContain('icacls');
      expect(cmd).toContain('/remove');
      expect(p.allowedPaths).not.toContain('C:\\project');
    });
  });

  describe('listProfiles', () => {
    it('should return empty array on non-Windows', async () => {
      setPlatform('linux');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await listProfiles();

      expect(result).toEqual([]);
      warnSpy.mockRestore();
    });

    it('should parse JSON output from PowerShell on Windows', async () => {
      setPlatform('win32');
      mockedExecSync.mockReturnValueOnce(
        JSON.stringify([
          { Name: 'profile1', Sid: 'S-1-15-2-111' },
          { Name: 'profile2', Sid: 'S-1-15-2-222' },
        ]),
      );

      const result = await listProfiles();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('profile1');
      expect(result[0].sid).toBe('S-1-15-2-111');
      expect(result[1].name).toBe('profile2');
      expect(result[1].sid).toBe('S-1-15-2-222');
    });

    it('should handle a single profile (non-array JSON)', async () => {
      setPlatform('win32');
      mockedExecSync.mockReturnValueOnce(
        JSON.stringify({ Name: 'only-one', Sid: 'S-1-15-2-333' }),
      );

      const result = await listProfiles();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('only-one');
    });

    it('should return empty array on parse failure', async () => {
      setPlatform('win32');
      mockedExecSync.mockReturnValueOnce('not-json');

      const result = await listProfiles();

      expect(result).toEqual([]);
    });

    it('should return empty array when command throws', async () => {
      setPlatform('win32');
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error('PowerShell error');
      });

      const result = await listProfiles();

      expect(result).toEqual([]);
    });
  });
});
