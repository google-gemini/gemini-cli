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

vi.mock('../../utils/shell-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../utils/shell-utils.js')>();
  return {
    ...actual,
    initializeShellParsers: vi.fn(),
    isStrictlyApproved: vi.fn().mockResolvedValue(true),
  };
});

describe('WindowsSandboxManager', () => {
  let manager: WindowsSandboxManager | undefined;
  let testCwd: string;

  beforeEach(() => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.spyOn(sandboxManager, 'tryRealpath').mockImplementation(async (p) =>
      p.toString(),
    );
    testCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-test-'));
    vi.spyOn(fs, 'writeFileSync');
  });

  afterEach(() => {
    manager?.cleanup();
    vi.restoreAllMocks();
    fs.rmSync(testCwd, { recursive: true, force: true });
  });

  it('should prepare a GeminiSandbox.exe command', async () => {
    manager = new WindowsSandboxManager({
      workspace: testCwd,
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
      expect.stringMatching(/gemini-cli-sandbox-[^/\\]+[/\\]acls-.*\.txt$/),
      'whoami',
      '/groups',
    ]);
  });

  it('should handle networkAccess from config', async () => {
    manager = new WindowsSandboxManager({
      workspace: testCwd,
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

  it('should handle network access from additionalPermissions', async () => {
    manager = new WindowsSandboxManager({
      workspace: testCwd,
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
    const persistentPath = path.resolve('/persistent/path');
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
      String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]acls-.*\.txt$/),
    );
    expect(aclCall).toBeDefined();
    expect(aclCall![1]).toContain(`L ${persistentPath}`);
  });

  it('should sanitize environment variables', async () => {
    manager = new WindowsSandboxManager({
      workspace: testCwd,
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
    manager = new WindowsSandboxManager({
      workspace: testCwd,
      modeConfig: { readonly: false, allowOverrides: true },
    });
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

      const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]acls-.*\.txt$/),
      );
      expect(aclCall).toBeDefined();
      expect(aclCall![1]).toContain(`L ${path.resolve(testCwd)}`);
      expect(aclCall![1]).toContain(`L ${path.resolve(allowedPath)}`);
    } finally {
      fs.rmSync(allowedPath, { recursive: true, force: true });
    }
  });

  it('should grant Low Integrity access to additional write paths', async () => {
    manager = new WindowsSandboxManager({
      workspace: testCwd,
    });
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

      const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]acls-.*\.txt$/),
      );
      expect(aclCall).toBeDefined();
      expect(aclCall![1]).toContain(`L ${path.resolve(extraWritePath)}`);
    } finally {
      fs.rmSync(extraWritePath, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')(
    'should reject UNC paths in grantLowIntegrityAccess',
    async () => {
      manager = new WindowsSandboxManager({
        workspace: testCwd,
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

      await manager.prepareCommand(req);

      const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]acls-.*\.txt$/),
      );
      if (aclCall) {
        expect(aclCall[1]).not.toContain(`L ${uncPath}`);
      }
    },
  );

  it.runIf(process.platform === 'win32')(
    'should allow extended-length and local device paths',
    async () => {
      manager = new WindowsSandboxManager({
        workspace: testCwd,
      });
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

      const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]acls-.*\.txt$/),
      );
      expect(aclCall).toBeDefined();
      expect(aclCall![1]).toContain(`L ${longPath}`);
      expect(aclCall![1]).toContain(`L ${devicePath}`);
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
      forbiddenPaths: [missingPath],
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
      String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]acls-.*\.txt$/),
    );
    if (aclCall) {
      expect(aclCall[1]).not.toContain(`D ${path.resolve(missingPath)}`);
    }
  });

  it('should deny access to discovered secret files (e.g., .env)', async () => {
    manager = new WindowsSandboxManager({
      workspace: testCwd,
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
      String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]acls-.*\.txt$/),
    );
    expect(aclCall).toBeDefined();
    expect(aclCall![1]).toContain(`D ${path.resolve(envFile)}`);
  });

  describe('isKnownSafeCommand', () => {
    it('should return true for approved tools in modeConfig', () => {
      manager = new WindowsSandboxManager({
        workspace: testCwd,
        modeConfig: { approvedTools: ['my-safe-tool'] },
      });

      expect(manager.isKnownSafeCommand(['my-safe-tool', 'arg'])).toBe(true);
      expect(manager.isKnownSafeCommand(['MY-SAFE-TOOL', 'arg'])).toBe(true);
    });

    it('should fall back to default isKnownSafeCommand logic', () => {
      manager = new WindowsSandboxManager({
        workspace: testCwd,
      });
      // 'git' is typically a known safe command in commandSafety.ts
      expect(manager.isKnownSafeCommand(['git', 'status'])).toBe(true);
      expect(manager.isKnownSafeCommand(['unknown-tool'])).toBe(false);
    });
  });

  it('should deny Low Integrity access to forbidden paths', async () => {
    const forbiddenPath = path.join(os.tmpdir(), 'gemini-cli-test-forbidden');
    if (!fs.existsSync(forbiddenPath)) {
      fs.mkdirSync(forbiddenPath);
    }
    try {
      manager = new WindowsSandboxManager({
        workspace: testCwd,
        forbiddenPaths: [forbiddenPath],
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
        String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]acls-.*\.txt$/),
      );
      expect(aclCall).toBeDefined();
      expect(aclCall![1]).toContain(`D ${path.resolve(forbiddenPath)}`);
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
      manager = new WindowsSandboxManager({
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

      await manager.prepareCommand(req);

      const writeFileSyncCalls = vi.mocked(fs.writeFileSync).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]acls-.*\.txt$/),
      );
      expect(aclCall).toBeDefined();

      const content = String(aclCall![1]);
      const allowIndex = content.indexOf(`L ${path.resolve(conflictPath)}`);
      const denyIndex = content.indexOf(`D ${path.resolve(conflictPath)}`);

      expect(allowIndex).toBeGreaterThan(-1);
      expect(denyIndex).toBeGreaterThan(-1);
      expect(allowIndex).toBeLessThan(denyIndex);
    } finally {
      fs.rmSync(conflictPath, { recursive: true, force: true });
    }
  });
});
