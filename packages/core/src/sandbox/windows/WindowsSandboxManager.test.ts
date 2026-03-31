/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WindowsSandboxManager } from './WindowsSandboxManager.js';
import * as sandboxManager from '../../services/sandboxManager.js';
import type { SandboxRequest } from '../../services/sandboxManager.js';
import { spawnAsync } from '../../utils/shell-utils.js';
import type { SandboxPolicyManager } from '../../policy/sandboxPolicyManager.js';

vi.mock('../../utils/shell-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../utils/shell-utils.js')>();
  return {
    ...actual,
    spawnAsync: vi.fn(),
    initializeShellParsers: vi.fn(),
    isStrictlyApproved: vi.fn().mockResolvedValue(true),
  };
});

describe('WindowsSandboxManager', () => {
  let manager: WindowsSandboxManager;
  let testCwd: string;

  beforeEach(() => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.spyOn(sandboxManager, 'tryRealpath').mockImplementation(async (p) =>
      p.toString(),
    );
    testCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-test-'));
    manager = new WindowsSandboxManager({
      workspace: testCwd,
      modeConfig: { readonly: false, allowOverrides: true },
      forbiddenPaths: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(testCwd, { recursive: true, force: true });
  });

  it('should prepare a GeminiSandbox.exe command', async () => {
    const req: SandboxRequest = {
      command: 'whoami',
      args: ['/groups'],
      cwd: testCwd,
      env: { TEST_VAR: 'test_value' },
      policy: {
        networkAccess: false,
      },
    };

    const result = await manager.prepareCommand(req);

    expect(result.program).toContain('GeminiSandbox.exe');
    expect(result.args).toEqual([
      '0',
      testCwd,
      '--forbidden-manifest',
      expect.stringMatching(/manifest\.txt$/),
      'whoami',
      '/groups',
    ]);
  });

  it('should handle networkAccess from config', async () => {
    const req: SandboxRequest = {
      command: 'whoami',
      args: [],
      cwd: testCwd,
      env: {},
      policy: {
        networkAccess: true,
      },
    };

    const result = await manager.prepareCommand(req);
    expect(result.args[0]).toBe('1');
  });

  it('should handle network access from additionalPermissions', async () => {
    const req: SandboxRequest = {
      command: 'whoami',
      args: [],
      cwd: testCwd,
      env: {},
      policy: {
        additionalPermissions: {
          network: true,
        },
      },
    };

    const result = await manager.prepareCommand(req);
    expect(result.args[0]).toBe('1');
  });

  it('should reject network access in Plan mode', async () => {
    const planManager = new WindowsSandboxManager({
      workspace: testCwd,
      modeConfig: { readonly: true, allowOverrides: false },
      forbiddenPaths: [],
    });
    const req: SandboxRequest = {
      command: 'curl',
      args: ['google.com'],
      cwd: testCwd,
      env: {},
      policy: {
        additionalPermissions: { network: true },
      },
    };

    await expect(planManager.prepareCommand(req)).rejects.toThrow(
      'Sandbox request rejected: Cannot override readonly/network/filesystem restrictions in Plan mode.',
    );
  });

  it('should handle persistent permissions from policyManager', async () => {
    const persistentPath = path.resolve('/persistent/path');
    const mockPolicyManager = {
      getCommandPermissions: vi.fn().mockReturnValue({
        fileSystem: { write: [persistentPath] },
        network: true,
      }),
    } as unknown as SandboxPolicyManager;

    const managerWithPolicy = new WindowsSandboxManager({
      workspace: testCwd,
      modeConfig: { allowOverrides: true, network: false },
      policyManager: mockPolicyManager,
      forbiddenPaths: [],
    });

    const req: SandboxRequest = {
      command: 'test-cmd',
      args: [],
      cwd: testCwd,
      env: {},
    };

    const result = await managerWithPolicy.prepareCommand(req);
    expect(result.args[0]).toBe('1'); // Network allowed by persistent policy

    const icaclsArgs = vi
      .mocked(spawnAsync)
      .mock.calls.filter((c) => c[0] === 'icacls')
      .map((c) => c[1]);

    expect(icaclsArgs).toContainEqual([
      persistentPath,
      '/setintegritylevel',
      '(OI)(CI)Low',
    ]);
  });

  it('should sanitize environment variables', async () => {
    const req: SandboxRequest = {
      command: 'test',
      args: [],
      cwd: testCwd,
      env: {
        API_KEY: 'secret',
        PATH: '/usr/bin',
      },
      policy: {
        sanitizationConfig: {
          allowedEnvironmentVariables: ['PATH'],
          blockedEnvironmentVariables: ['API_KEY'],
          enableEnvironmentVariableRedaction: true,
        },
      },
    };

    const result = await manager.prepareCommand(req);
    expect(result.env['PATH']).toBe('/usr/bin');
    expect(result.env['API_KEY']).toBeUndefined();
  });

  it('should ensure governance files exist', async () => {
    const req: SandboxRequest = {
      command: 'test',
      args: [],
      cwd: testCwd,
      env: {},
    };

    await manager.prepareCommand(req);

    expect(fs.existsSync(path.join(testCwd, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(testCwd, '.geminiignore'))).toBe(true);
    expect(fs.existsSync(path.join(testCwd, '.git'))).toBe(true);
    expect(fs.lstatSync(path.join(testCwd, '.git')).isDirectory()).toBe(true);
  });

  it('should grant Low Integrity access to the workspace and allowed paths', async () => {
    const allowedPath = path.join(os.tmpdir(), 'gemini-cli-test-allowed');
    if (!fs.existsSync(allowedPath)) {
      fs.mkdirSync(allowedPath);
    }
    try {
      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: testCwd,
        env: {},
        policy: {
          allowedPaths: [allowedPath],
        },
      };

      await manager.prepareCommand(req);

      const icaclsArgs = vi
        .mocked(spawnAsync)
        .mock.calls.filter((c) => c[0] === 'icacls')
        .map((c) => c[1]);

      expect(icaclsArgs).toContainEqual([
        path.resolve(testCwd),
        '/setintegritylevel',
        '(OI)(CI)Low',
      ]);

      expect(icaclsArgs).toContainEqual([
        path.resolve(allowedPath),
        '/setintegritylevel',
        '(OI)(CI)Low',
      ]);
    } finally {
      fs.rmSync(allowedPath, { recursive: true, force: true });
    }
  });

  it('should grant Low Integrity access to additional write paths', async () => {
    const extraWritePath = path.join(
      os.tmpdir(),
      'gemini-cli-test-extra-write',
    );
    if (!fs.existsSync(extraWritePath)) {
      fs.mkdirSync(extraWritePath);
    }
    try {
      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: testCwd,
        env: {},
        policy: {
          additionalPermissions: {
            fileSystem: {
              write: [extraWritePath],
            },
          },
        },
      };

      await manager.prepareCommand(req);

      const icaclsArgs = vi
        .mocked(spawnAsync)
        .mock.calls.filter((c) => c[0] === 'icacls')
        .map((c) => c[1]);

      expect(icaclsArgs).toContainEqual([
        path.resolve(extraWritePath),
        '/setintegritylevel',
        '(OI)(CI)Low',
      ]);
    } finally {
      fs.rmSync(extraWritePath, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')(
    'should reject UNC paths in grantLowIntegrityAccess',
    async () => {
      const uncPath = '\\\\attacker\\share\\malicious.txt';
      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: testCwd,
        env: {},
        policy: {
          additionalPermissions: {
            fileSystem: {
              write: [uncPath],
            },
          },
        },
      };

      await manager.prepareCommand(req);

      const icaclsArgs = vi
        .mocked(spawnAsync)
        .mock.calls.filter((c) => c[0] === 'icacls')
        .map((c) => c[1]);

      expect(icaclsArgs).not.toContainEqual([
        uncPath,
        '/setintegritylevel',
        '(OI)(CI)Low',
      ]);
    },
  );

  it.runIf(process.platform === 'win32')(
    'should allow extended-length and local device paths',
    async () => {
      const longPath = '\\\\?\\C:\\very\\long\\path';
      const devicePath = '\\\\.\\PhysicalDrive0';

      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: testCwd,
        env: {},
        policy: {
          additionalPermissions: {
            fileSystem: {
              write: [longPath, devicePath],
            },
          },
        },
      };

      await manager.prepareCommand(req);

      const icaclsArgs = vi
        .mocked(spawnAsync)
        .mock.calls.filter((c) => c[0] === 'icacls')
        .map((c) => c[1]);

      expect(icaclsArgs).toContainEqual([
        longPath,
        '/setintegritylevel',
        '(OI)(CI)Low',
      ]);
      expect(icaclsArgs).toContainEqual([
        devicePath,
        '/setintegritylevel',
        '(OI)(CI)Low',
      ]);
    },
  );

  it('skips denying access to non-existent forbidden paths to prevent icacls failure', async () => {
    const missingPath = path.join(
      os.tmpdir(),
      'gemini-cli-test-missing',
      'does-not-exist.txt',
    );

    // Ensure it definitely doesn't exist
    if (fs.existsSync(missingPath)) {
      fs.rmSync(missingPath, { recursive: true, force: true });
    }

    const managerWithForbidden = new WindowsSandboxManager({
      workspace: testCwd,
      forbiddenPaths: [missingPath],
    });

    const req: SandboxRequest = {
      command: 'test',
      args: [],
      cwd: testCwd,
      env: {},
    };

    await managerWithForbidden.prepareCommand(req);

    // Should NOT have called icacls to deny the missing path
    expect(spawnAsync).not.toHaveBeenCalledWith('icacls', [
      path.resolve(missingPath),
      '/deny',
      '*S-1-16-4096:(OI)(CI)(F)',
    ]);
  });

  it('should deny Low Integrity access to forbidden paths', async () => {
    const forbiddenPath = path.join(os.tmpdir(), 'gemini-cli-test-forbidden');
    if (!fs.existsSync(forbiddenPath)) {
      fs.mkdirSync(forbiddenPath);
    }
    try {
      const managerWithForbidden = new WindowsSandboxManager({
        workspace: testCwd,
        forbiddenPaths: [forbiddenPath],
      });

      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: testCwd,
        env: {},
      };

      await managerWithForbidden.prepareCommand(req);

      expect(spawnAsync).toHaveBeenCalledWith('icacls', [
        path.resolve(forbiddenPath),
        '/deny',
        '*S-1-16-4096:(OI)(CI)(F)',
      ]);
    } finally {
      fs.rmSync(forbiddenPath, { recursive: true, force: true });
    }
  });

  it('should override allowed paths if a path is also in forbidden paths', async () => {
    const conflictPath = path.join(os.tmpdir(), 'gemini-cli-test-conflict');
    if (!fs.existsSync(conflictPath)) {
      fs.mkdirSync(conflictPath);
    }
    try {
      const managerWithForbidden = new WindowsSandboxManager({
        workspace: testCwd,
        forbiddenPaths: [conflictPath],
      });

      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: testCwd,
        env: {},
        policy: {
          allowedPaths: [conflictPath],
        },
      };

      await managerWithForbidden.prepareCommand(req);

      const spawnMock = vi.mocked(spawnAsync);
      const allowCallIndex = spawnMock.mock.calls.findIndex(
        (call) =>
          call[1] &&
          call[1].includes('/setintegritylevel') &&
          call[0] === 'icacls' &&
          call[1][0] === path.resolve(conflictPath),
      );
      const denyCallIndex = spawnMock.mock.calls.findIndex(
        (call) =>
          call[1] &&
          call[1].includes('/deny') &&
          call[0] === 'icacls' &&
          call[1][0] === path.resolve(conflictPath),
      );

      // Both should have been called
      expect(allowCallIndex).toBeGreaterThan(-1);
      expect(denyCallIndex).toBeGreaterThan(-1);

      // Verify order: explicitly denying must happen after the explicit allow
      expect(allowCallIndex).toBeLessThan(denyCallIndex);
    } finally {
      fs.rmSync(conflictPath, { recursive: true, force: true });
    }
  });
});
