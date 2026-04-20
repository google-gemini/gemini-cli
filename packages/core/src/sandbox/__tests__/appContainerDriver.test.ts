/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppContainerDriver } from '../drivers/appContainerDriver.js';
import {
  SandboxStatus,
  SandboxDriverType,
  IsolationLevel,
  DEFAULT_SANDBOX_CONFIG,
} from '../types.js';

// Mock child_process to avoid calling real PowerShell/icacls
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
}));

// Mock the profile module so initialize() doesn't hit real PowerShell
vi.mock('../appContainerProfile.js', () => ({
  createProfile: vi.fn().mockResolvedValue({
    name: 'gemini-sandbox-mock',
    sid: 'S-1-15-2-00000',
    capabilities: [],
    allowedPaths: [],
  }),
  deleteProfile: vi.fn().mockResolvedValue(undefined),
  grantFileAccess: vi.fn().mockResolvedValue(undefined),
  revokeFileAccess: vi.fn().mockResolvedValue(undefined),
}));

// Mock file and network policies so they don't hit real OS
vi.mock('../appContainerFilePolicy.js', () => {
  class MockFileAccessPolicy {
    addReadAccess = vi.fn();
    addWriteAccess = vi.fn();
    addDenyAccess = vi.fn();
    applyToProfile = vi.fn().mockResolvedValue(undefined);
    getRules = vi.fn().mockReturnValue([]);
    generateAclCommands = vi.fn().mockReturnValue([]);
  }
  return {
    FileAccessPolicy: MockFileAccessPolicy,
    FileAccessType: {
      Read: 'read',
      Write: 'write',
      Deny: 'deny',
    },
  };
});

vi.mock('../appContainerNetworkPolicy.js', () => {
  class MockNetworkPolicy {
    addAllowedEndpoint = vi.fn();
    addBlockedEndpoint = vi.fn();
    getAllowed = vi.fn().mockReturnValue([]);
    getBlocked = vi.fn().mockReturnValue([]);
    toWindowsFirewallRules = vi.fn().mockReturnValue([]);
    applyPolicy = vi.fn().mockResolvedValue(undefined);
    removePolicy = vi.fn().mockResolvedValue(undefined);
  }
  return { NetworkPolicy: MockNetworkPolicy };
});

describe('AppContainerDriver', () => {
  let driver: AppContainerDriver;
  const originalPlatform = process.platform;

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value: platform });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    driver = new AppContainerDriver();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('metadata', () => {
    it('should have the correct type and name', () => {
      expect(driver.type).toBe(SandboxDriverType.AppContainer);
      expect(driver.name).toBe('Windows AppContainer');
    });

    it('should start in Uninitialized status', () => {
      expect(driver.status).toBe(SandboxStatus.Uninitialized);
    });
  });

  describe('isAvailable', () => {
    it('should return false on non-Windows platforms', async () => {
      setPlatform('linux');
      expect(await driver.isAvailable()).toBe(false);
    });

    it('should return false on macOS', async () => {
      setPlatform('darwin');
      expect(await driver.isAvailable()).toBe(false);
    });

    it('should check for PowerShell cmdlets on Windows', async () => {
      setPlatform('win32');

      const childProcess = await import('node:child_process');
      const mockedExecSync = vi.mocked(childProcess.execSync);
      mockedExecSync.mockReturnValueOnce('' as never);

      const available = await driver.isAvailable();
      expect(available).toBe(true);
      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('Get-Command New-AppContainerProfile'),
        expect.objectContaining({ timeout: 10_000 }),
      );
    });

    it('should return false when cmdlets are missing on Windows', async () => {
      setPlatform('win32');

      const childProcess = await import('node:child_process');
      const mockedExecSync = vi.mocked(childProcess.execSync);
      mockedExecSync.mockImplementationOnce(() => {
        throw new Error('cmdlet not found');
      });

      expect(await driver.isAvailable()).toBe(false);
    });
  });

  describe('getCapabilities', () => {
    it('should report Windows-only platform', () => {
      const caps = driver.getCapabilities();
      expect(caps.platforms).toEqual(['win32']);
    });

    it('should report file-system and process isolation', () => {
      const caps = driver.getCapabilities();
      expect(caps.fileSystemIsolation).toBe(true);
      expect(caps.processIsolation).toBe(true);
      expect(caps.mountSupport).toBe(false);
      expect(caps.envForwarding).toBe(true);
      expect(caps.portForwarding).toBe(false);
    });

    it('should report no network isolation when InternetClient is active', () => {
      // Default constructor includes InternetClient
      const caps = driver.getCapabilities();
      expect(caps.networkIsolation).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should fail on non-Windows platforms', async () => {
      setPlatform('linux');
      const diagnostics = await driver.initialize(DEFAULT_SANDBOX_CONFIG);

      expect(driver.status).toBe(SandboxStatus.Failed);
      expect(
        diagnostics.some((d) => d.code === 'APPCONTAINER_WRONG_PLATFORM'),
      ).toBe(true);
    });

    it('should fail when AppContainer cmdlets are not available', async () => {
      setPlatform('win32');

      const childProcess = await import('node:child_process');
      const mockedExecSync = vi.mocked(childProcess.execSync);
      mockedExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const diagnostics = await driver.initialize(DEFAULT_SANDBOX_CONFIG);

      expect(driver.status).toBe(SandboxStatus.Failed);
      expect(
        diagnostics.some((d) => d.code === 'APPCONTAINER_NOT_AVAILABLE'),
      ).toBe(true);
    });

    it('should create profile and become ready on Windows', async () => {
      setPlatform('win32');

      const childProcess = await import('node:child_process');
      const mockedExecSync = vi.mocked(childProcess.execSync);
      // isAvailable check
      mockedExecSync.mockReturnValue('' as never);

      const diagnostics = await driver.initialize(DEFAULT_SANDBOX_CONFIG);

      expect(driver.status).toBe(SandboxStatus.Ready);
      expect(
        diagnostics.some((d) => d.code === 'APPCONTAINER_PROFILE_CREATED'),
      ).toBe(true);
      expect(diagnostics.some((d) => d.code === 'APPCONTAINER_READY')).toBe(
        true,
      );
    });

    it('should configure file-system access for workDir', async () => {
      setPlatform('win32');

      const childProcess = await import('node:child_process');
      vi.mocked(childProcess.execSync).mockReturnValue('' as never);

      const diagnostics = await driver.initialize({
        ...DEFAULT_SANDBOX_CONFIG,
        workDir: 'C:\\myproject',
      });

      expect(
        diagnostics.some((d) => d.code === 'APPCONTAINER_FS_CONFIGURED'),
      ).toBe(true);
    });
  });

  describe('start', () => {
    it('should throw if not in Ready state', async () => {
      await expect(driver.start()).rejects.toThrow('Cannot start');
    });

    it('should succeed when Ready', async () => {
      setPlatform('win32');
      const childProcess = await import('node:child_process');
      vi.mocked(childProcess.execSync).mockReturnValue('' as never);

      await driver.initialize(DEFAULT_SANDBOX_CONFIG);
      await expect(driver.start()).resolves.not.toThrow();
    });
  });

  describe('stop', () => {
    it('should set status to Stopped', async () => {
      await driver.stop();
      expect(driver.status).toBe(SandboxStatus.Stopped);
    });
  });

  describe('cleanup', () => {
    it('should reset status to Uninitialized', async () => {
      await driver.cleanup();
      expect(driver.status).toBe(SandboxStatus.Uninitialized);
    });

    it('should delete profile during cleanup', async () => {
      setPlatform('win32');
      const childProcess = await import('node:child_process');
      vi.mocked(childProcess.execSync).mockReturnValue('' as never);

      await driver.initialize(DEFAULT_SANDBOX_CONFIG);
      expect(driver.getProfile()).not.toBeNull();

      await driver.cleanup();
      expect(driver.getProfile()).toBeNull();

      const { deleteProfile } = await import('../appContainerProfile.js');
      expect(deleteProfile).toHaveBeenCalled();
    });
  });

  describe('diagnose', () => {
    it('should report wrong platform on non-Windows', async () => {
      setPlatform('linux');
      const diagnostics = await driver.diagnose();
      expect(
        diagnostics.some((d) => d.code === 'APPCONTAINER_WRONG_PLATFORM'),
      ).toBe(true);
    });

    it('should report availability status on Windows', async () => {
      setPlatform('win32');
      const childProcess = await import('node:child_process');
      vi.mocked(childProcess.execSync).mockReturnValue('' as never);

      const diagnostics = await driver.diagnose();
      expect(diagnostics.some((d) => d.code === 'APPCONTAINER_OK')).toBe(true);
    });

    it('should include active profile info after initialization', async () => {
      setPlatform('win32');
      const childProcess = await import('node:child_process');
      vi.mocked(childProcess.execSync).mockReturnValue('' as never);

      await driver.initialize(DEFAULT_SANDBOX_CONFIG);
      const diagnostics = await driver.diagnose();

      expect(
        diagnostics.some((d) => d.code === 'APPCONTAINER_ACTIVE_PROFILE'),
      ).toBe(true);
    });
  });

  describe('getProfile / getNetworkPolicy / getFilePolicy', () => {
    it('should return null before initialization', () => {
      expect(driver.getProfile()).toBeNull();
      expect(driver.getNetworkPolicy()).toBeNull();
      expect(driver.getFilePolicy()).toBeNull();
    });

    it('should return objects after initialization', async () => {
      setPlatform('win32');
      const childProcess = await import('node:child_process');
      vi.mocked(childProcess.execSync).mockReturnValue('' as never);

      await driver.initialize(DEFAULT_SANDBOX_CONFIG);

      expect(driver.getProfile()).not.toBeNull();
      expect(driver.getNetworkPolicy()).not.toBeNull();
      expect(driver.getFilePolicy()).not.toBeNull();
    });
  });

  describe('isolation level', () => {
    it('should strip network capabilities for Network isolation level', async () => {
      setPlatform('win32');
      const childProcess = await import('node:child_process');
      vi.mocked(childProcess.execSync).mockReturnValue('' as never);

      await driver.initialize({
        ...DEFAULT_SANDBOX_CONFIG,
        isolationLevel: IsolationLevel.Network,
      });

      // After initialization with Network isolation, capabilities
      // should reflect full network isolation.
      const caps = driver.getCapabilities();
      expect(caps.networkIsolation).toBe(true);
    });

    it('should strip network capabilities for Full isolation level', async () => {
      setPlatform('win32');
      const childProcess = await import('node:child_process');
      vi.mocked(childProcess.execSync).mockReturnValue('' as never);

      await driver.initialize({
        ...DEFAULT_SANDBOX_CONFIG,
        isolationLevel: IsolationLevel.Full,
      });

      const caps = driver.getCapabilities();
      expect(caps.networkIsolation).toBe(true);
    });
  });
});
