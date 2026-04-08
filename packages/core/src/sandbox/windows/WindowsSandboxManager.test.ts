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

  /**
   * Creates a temporary directory and returns its canonical real path.
   */
  function createTempDir(name: string, parent = os.tmpdir()): string {
    const rawPath = fs.mkdtempSync(path.join(parent, `gemini-test-${name}-`));
    return fs.realpathSync(rawPath);
  }

  const helperExePath = path.resolve(
    __dirname,
    WindowsSandboxManager.HELPER_EXE,
  );

  beforeEach(() => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.spyOn(sandboxManager, 'tryRealpath').mockImplementation(async (p) =>
      p.toString(),
    );

    // Mock existsSync to skip the csc.exe auto-compilation of helper during unit tests.
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p === 'string' && path.resolve(p) === helperExePath) {
        return true;
      }
      return originalExistsSync(p);
    });

    testCwd = createTempDir('cwd');

    manager = new WindowsSandboxManager({
      workspace: testCwd,
      modeConfig: { readonly: false, allowOverrides: true },
      forbiddenPaths: async () => [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (testCwd && fs.existsSync(testCwd)) {
      fs.rmSync(testCwd, { recursive: true, force: true });
    }
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

  it('should NOT whitelist drive roots in YOLO mode', async () => {
    manager = new WindowsSandboxManager({
      workspace: testCwd,
      modeConfig: { readonly: false, allowOverrides: true, yolo: true },
      forbiddenPaths: async () => [],
    });

    const req: SandboxRequest = {
      command: 'whoami',
      args: [],
      cwd: testCwd,
      env: {},
    };

    await manager.prepareCommand(req);

    // Verify spawnAsync was called for icacls
    const icaclsCalls = vi
      .mocked(spawnAsync)
      .mock.calls.filter((call) => call[0] === 'icacls');

    // Should NOT have called icacls for C:\, D:\, etc.
    const driveRootCalls = icaclsCalls.filter(
      (call) =>
        typeof call[1]?.[0] === 'string' && /^[A-Z]:\\$/.test(call[1][0]),
    );
    expect(driveRootCalls).toHaveLength(0);
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
      forbiddenPaths: async () => [],
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
    const persistentPath = createTempDir('persistent', testCwd);

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
      forbiddenPaths: async () => [],
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
      '/grant',
      '*S-1-16-4096:(OI)(CI)(M)',
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
    const allowedPath = createTempDir('allowed');
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
        testCwd,
        '/grant',
        '*S-1-16-4096:(OI)(CI)(M)',
        '/setintegritylevel',
        '(OI)(CI)Low',
      ]);

      expect(icaclsArgs).toContainEqual([
        allowedPath,
        '/grant',
        '*S-1-16-4096:(OI)(CI)(M)',
        '/setintegritylevel',
        '(OI)(CI)Low',
      ]);
    } finally {
      fs.rmSync(allowedPath, { recursive: true, force: true });
    }
  });

  it('should grant Low Integrity access to additional write paths', async () => {
    const extraWritePath = createTempDir('extra-write');
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
        extraWritePath,
        '/grant',
        '*S-1-16-4096:(OI)(CI)(M)',
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

      // Rejected because it's an unreachable/invalid UNC path or it doesn't exist
      await expect(manager.prepareCommand(req)).rejects.toThrow();

      const icaclsArgs = vi
        .mocked(spawnAsync)
        .mock.calls.filter((c) => c[0] === 'icacls')
        .map((c) => c[1]);

      expect(icaclsArgs).not.toContainEqual(expect.arrayContaining([uncPath]));
    },
  );

  it.runIf(process.platform === 'win32')(
    'should allow extended-length and local device paths',
    async () => {
      // Create actual files for inheritance/existence checks
      const longPath = path.join(testCwd, 'very_long_path.txt');
      const devicePath = path.join(testCwd, 'device_path.txt');
      fs.writeFileSync(longPath, '');
      fs.writeFileSync(devicePath, '');

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
        path.resolve(longPath),
        '/grant',
        '*S-1-16-4096:(M)',
        '/setintegritylevel',
        'Low',
      ]);
      expect(icaclsArgs).toContainEqual([
        path.resolve(devicePath),
        '/grant',
        '*S-1-16-4096:(M)',
        '/setintegritylevel',
        'Low',
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
      forbiddenPaths: async () => [missingPath],
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
    const forbiddenPath = createTempDir('forbidden');
    try {
      const managerWithForbidden = new WindowsSandboxManager({
        workspace: testCwd,
        forbiddenPaths: async () => [forbiddenPath],
      });

      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: testCwd,
        env: {},
      };

      await managerWithForbidden.prepareCommand(req);

      expect(spawnAsync).toHaveBeenCalledWith('icacls', [
        forbiddenPath,
        '/deny',
        '*S-1-16-4096:(OI)(CI)(F)',
      ]);
    } finally {
      fs.rmSync(forbiddenPath, { recursive: true, force: true });
    }
  });

  it('should override allowed paths if a path is also in forbidden paths', async () => {
    const conflictPath = createTempDir('conflict');
    try {
      const managerWithForbidden = new WindowsSandboxManager({
        workspace: testCwd,
        forbiddenPaths: async () => [conflictPath],
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
          call[1][0] === conflictPath,
      );
      const denyCallIndex = spawnMock.mock.calls.findIndex(
        (call) =>
          call[1] &&
          call[1].includes('/deny') &&
          call[0] === 'icacls' &&
          call[1][0] === conflictPath,
      );

      // Conflict should have been filtered out of allow calls
      expect(allowCallIndex).toBe(-1);
      expect(denyCallIndex).toBeGreaterThan(-1);
    } finally {
      fs.rmSync(conflictPath, { recursive: true, force: true });
    }
  });

  it('should pass __write directly to native helper', async () => {
    const filePath = path.join(testCwd, 'test.txt');
    fs.writeFileSync(filePath, '');
    const req: SandboxRequest = {
      command: '__write',
      args: [filePath],
      cwd: testCwd,
      env: {},
    };

    const result = await manager.prepareCommand(req);

    // [network, cwd, --forbidden-manifest, manifestPath, command, ...args]
    expect(result.args[4]).toBe('__write');
    expect(result.args[5]).toBe(filePath);
  });

  it('should safely handle special characters in __write path using environment variables', async () => {
    const maliciousPath = path.join(testCwd, 'foo & echo bar; ! .txt');
    fs.writeFileSync(maliciousPath, '');
    const req: SandboxRequest = {
      command: '__write',
      args: [maliciousPath],
      cwd: testCwd,
      env: {},
    };

    const result = await manager.prepareCommand(req);

    // Native commands pass arguments directly; the binary handles quoting via QuoteArgument
    expect(result.args[4]).toBe('__write');
    expect(result.args[5]).toBe(maliciousPath);
  });

  it('should pass __read directly to native helper', async () => {
    const filePath = path.join(testCwd, 'test.txt');
    fs.writeFileSync(filePath, 'hello');
    const req: SandboxRequest = {
      command: '__read',
      args: [filePath],
      cwd: testCwd,
      env: {},
    };

    const result = await manager.prepareCommand(req);

    expect(result.args[4]).toBe('__read');
    expect(result.args[5]).toBe(filePath);
  });

  it('should return a cleanup function that deletes the temporary manifest', async () => {
    const req: SandboxRequest = {
      command: 'test',
      args: [],
      cwd: testCwd,
      env: {},
    };

    const result = await manager.prepareCommand(req);
    const manifestPath = result.args[3];

    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(result.cleanup).toBeDefined();

    result.cleanup?.();
    expect(fs.existsSync(manifestPath)).toBe(false);
    expect(fs.existsSync(path.dirname(manifestPath))).toBe(false);
  });
});
