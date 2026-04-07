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
import type { SandboxPolicyManager } from '../../policy/sandboxPolicyManager.js';
import { spawnAsync } from '../../utils/shell-utils.js';

vi.mock('../../utils/shell-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../utils/shell-utils.js')>();
  return {
    ...actual,
    initializeShellParsers: vi.fn(),
    isStrictlyApproved: vi.fn().mockResolvedValue(true),
    spawnAsync: vi
      .fn()
      .mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  };
});

describe('WindowsSandboxManager', () => {
  let manager: WindowsSandboxManager | undefined;
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
    vi.spyOn(fs, 'writeFileSync');

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
    manager = new WindowsSandboxManager({
      workspace: testCwd,
      forbiddenPaths: async () => [],
    });
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
      '--setup-manifest',
      expect.stringMatching(/gemini-cli-sandbox-.*\.txt$/),
      'whoami',
      '/groups',
    ]);
  });

  it('should handle networkAccess from config', async () => {
    manager = new WindowsSandboxManager({
      workspace: testCwd,
      forbiddenPaths: async () => [],
    });
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

    // Verify spawnAsync was NOT called for icacls (batching manifest is used instead)
    const icaclsCalls = vi
      .mocked(spawnAsync)
      .mock.calls.filter((call) => call[0] === 'icacls');
    expect(icaclsCalls).toHaveLength(0);
  });

  it('should handle network access from additionalPermissions', async () => {
    manager = new WindowsSandboxManager({
      workspace: testCwd,
      forbiddenPaths: async () => [],
    });
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
    manager = new WindowsSandboxManager({
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

    await expect(manager.prepareCommand(req)).rejects.toThrow(
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

    manager = new WindowsSandboxManager({
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

    const result = await manager.prepareCommand(req);
    expect(result.args[0]).toBe('1'); // Network allowed by persistent policy

    const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
    const aclCall = writeFileSyncCalls.find((call) =>
      String(call[0]).match(/gemini-cli-sandbox-.*\.txt$/),
    );
    expect(aclCall).toBeDefined();
    expect(aclCall![1]).toContain(`L ${persistentPath}`);
  });

  it('should sanitize environment variables', async () => {
    manager = new WindowsSandboxManager({
      workspace: testCwd,
      forbiddenPaths: async () => [],
    });
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
    manager = new WindowsSandboxManager({
      workspace: testCwd,
      forbiddenPaths: async () => [],
    });
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

      await manager!.prepareCommand(req);

      const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-.*\.txt$/),
      );
      expect(aclCall).toBeDefined();
      expect(aclCall![1]).toContain(`L ${path.resolve(testCwd)}`);
      expect(aclCall![1]).toContain(`L ${path.resolve(allowedPath)}`);
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

      await manager!.prepareCommand(req);

      const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-.*\.txt$/),
      );
      expect(aclCall).toBeDefined();
      expect(aclCall![1]).toContain(`L ${path.resolve(extraWritePath)}`);
    } finally {
      fs.rmSync(extraWritePath, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')(
    'should reject UNC paths in grantLowIntegrityOp',
    async () => {
      manager = new WindowsSandboxManager({
        workspace: testCwd,
        forbiddenPaths: async () => [],
      });
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

      const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-.*\.txt$/),
      );
      if (aclCall) {
        expect(aclCall[1]).not.toContain(`L ${uncPath}`);
      }
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

      await manager!.prepareCommand(req);

      const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-.*\.txt$/),
      );
      expect(aclCall).toBeDefined();
      expect(aclCall![1]).toContain(`L ${path.resolve(longPath)}`);
      expect(aclCall![1]).toContain(`L ${path.resolve(devicePath)}`);
    },
  );

  it('skips denying access to non-existent forbidden paths to prevent failure', async () => {
    const missingPath = path.join(
      os.tmpdir(),
      'gemini-cli-test-missing',
      'does-not-exist.txt',
    );

    // Ensure it definitely doesn't exist
    if (fs.existsSync(missingPath)) {
      fs.rmSync(missingPath, { recursive: true, force: true });
    }

    manager = new WindowsSandboxManager({
      workspace: testCwd,
      forbiddenPaths: async () => [missingPath],
    });

    const req: SandboxRequest = {
      command: 'test',
      args: [],
      cwd: testCwd,
      env: {},
    };

    await manager.prepareCommand(req);

    // Should NOT have included the missing path in the ACL manifest
    const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
    const aclCall = writeFileSyncCalls.find((call) =>
      String(call[0]).match(/gemini-cli-sandbox-.*\.txt$/),
    );
    if (aclCall) {
      expect(aclCall[1]).not.toContain(`D ${path.resolve(missingPath)}`);
    }
  });

  it('should deny access to discovered secret files (e.g., .env)', async () => {
    manager = new WindowsSandboxManager({
      workspace: testCwd,
      forbiddenPaths: async () => [],
    });
    const envFile = path.join(testCwd, '.env');
    fs.writeFileSync(envFile, 'API_KEY=secret');

    const req: SandboxRequest = {
      command: 'test',
      args: [],
      cwd: testCwd,
      env: {},
    };

    await manager.prepareCommand(req);

    const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
    const aclCall = writeFileSyncCalls.find((call) =>
      String(call[0]).match(/gemini-cli-sandbox-.*\.txt$/),
    );
    expect(aclCall).toBeDefined();
    expect(aclCall![1]).toContain(`D ${path.resolve(envFile)}`);
  });

  describe('isKnownSafeCommand', () => {
    it('should return true for approved tools in modeConfig', () => {
      manager = new WindowsSandboxManager({
        workspace: testCwd,
        modeConfig: { approvedTools: ['my-safe-tool'] },
        forbiddenPaths: async () => [],
      });

      expect(manager.isKnownSafeCommand(['my-safe-tool', 'arg'])).toBe(true);
      expect(manager.isKnownSafeCommand(['MY-SAFE-TOOL', 'arg'])).toBe(true);
    });

    it('should fall back to default isKnownSafeCommand logic', () => {
      manager = new WindowsSandboxManager({
        workspace: testCwd,
        forbiddenPaths: async () => [],
      });
      // 'git' is typically a known safe command in commandSafety.ts
      expect(manager.isKnownSafeCommand(['git', 'status'])).toBe(true);
      expect(manager.isKnownSafeCommand(['unknown-tool'])).toBe(false);
    });
  });

  it('should deny Low Integrity access to forbidden paths', async () => {
    const forbiddenPath = createTempDir('forbidden');
    try {
      manager = new WindowsSandboxManager({
        workspace: testCwd,
        forbiddenPaths: async () => [forbiddenPath],
      });

      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: testCwd,
        env: {},
      };

      await manager.prepareCommand(req);

      const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-.*\.txt$/),
      );
      expect(aclCall).toBeDefined();
      expect(aclCall![1]).toContain(`D ${path.resolve(forbiddenPath)}`);
    } finally {
      fs.rmSync(forbiddenPath, { recursive: true, force: true });
    }
  });

  it('should override allowed paths if a path is also in forbidden paths', async () => {
    const conflictPath = createTempDir('conflict');
    try {
      manager = new WindowsSandboxManager({
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

      await manager.prepareCommand(req);

      const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-.*\.txt$/),
      );
      expect(aclCall).toBeDefined();

      const content = String(aclCall![1]);
      const allowIndex = content.indexOf(`L ${path.resolve(conflictPath)}`);
      const denyIndex = content.indexOf(`D ${path.resolve(conflictPath)}`);

      // Forbidden path should have been filtered out of grant list
      expect(allowIndex).toBe(-1);
      expect(denyIndex).toBeGreaterThan(-1);
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

    const result = await manager!.prepareCommand(req);

    // [network, cwd, --setup-manifest, manifestPath, command, ...args]
    expect(result.args[4]).toBe('__write');
    expect(result.args[5]).toBe(filePath);
  });

  it('should safely handle special characters in __write path', async () => {
    const maliciousPath = path.join(testCwd, 'foo & echo bar; ! .txt');
    fs.writeFileSync(maliciousPath, '');
    const req: SandboxRequest = {
      command: '__write',
      args: [maliciousPath],
      cwd: testCwd,
      env: {},
    };

    const result = await manager!.prepareCommand(req);

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

    const result = await manager!.prepareCommand(req);

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

    const result = await manager!.prepareCommand(req);
    const manifestPath = result.args[3];

    expect(fs.existsSync(manifestPath)).toBe(true);

    result.cleanup?.();
    expect(fs.existsSync(manifestPath)).toBe(false);
  });
});
