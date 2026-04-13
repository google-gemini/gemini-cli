/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  WindowsSandboxManager,
  isSecretFile,
  findSecretFiles,
} from './WindowsSandboxManager.js';
import {
  isDangerousCommand as isWindowsDangerousCommand,
  isKnownSafeCommand as isWindowsSafeCommand,
} from './commandSafety.js';
import { parseWindowsSandboxDenials } from './windowsSandboxDenialUtils.js';
import type { SandboxRequest } from '../../services/sandboxManager.js';
import type { SandboxPolicyManager } from '../../policy/sandboxPolicyManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';

vi.mock('../../utils/shell-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../utils/shell-utils.js')>();
  return {
    ...actual,
    initializeShellParsers: vi.fn(),
    isStrictlyApproved: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('./commandSafety.js', () => ({
  isKnownSafeCommand: vi.fn().mockReturnValue(false),
  isDangerousCommand: vi.fn(),
}));

vi.mock('./windowsSandboxDenialUtils.js', () => ({
  parseWindowsSandboxDenials: vi.fn(),
}));

describe('WindowsSandboxManager', () => {
  let manager: WindowsSandboxManager;
  let testCwd: string;

  beforeEach(() => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');

    testCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-test-'));
    vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
    manager = new WindowsSandboxManager({
      workspace: testCwd,
      modeConfig: { readonly: false, allowOverrides: true },
      forbiddenPaths: async () => [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(testCwd, { recursive: true, force: true });
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
      vi.mocked(isWindowsSafeCommand).mockReturnValue(true);
      // 'git' is typically a known safe command in commandSafety.ts
      expect(manager.isKnownSafeCommand(['git', 'status'])).toBe(true);
      expect(manager.isKnownSafeCommand(['unknown-tool'])).toBe(true); // mocked to true
    });
  });

  describe('isDangerousCommand', () => {
    it('should delegate to isWindowsDangerousCommand', () => {
      vi.mocked(isWindowsDangerousCommand).mockReturnValue(true);
      expect(manager.isDangerousCommand(['del', '/f'])).toBe(true);
      expect(isWindowsDangerousCommand).toHaveBeenCalledWith(['del', '/f']);
    });
  });

  describe('parseDenials', () => {
    it('should delegate to parseWindowsSandboxDenials', () => {
      const mockResult = {
        exitCode: 1,
        output: 'Access is denied.',
      } as unknown as ShellExecutionResult;
      const mockParsed = { filePaths: ['C:\\blocked'] };
      vi.mocked(parseWindowsSandboxDenials).mockReturnValue(mockParsed);

      expect(manager.parseDenials(mockResult)).toBe(mockParsed);
      expect(parseWindowsSandboxDenials).toHaveBeenCalledWith(
        mockResult,
        expect.any(Object),
      );
    });
  });

  describe('isSecretFile', () => {
    it('should return true for .env', () => {
      expect(isSecretFile('.env')).toBe(true);
    });

    it('should return true for .env.local', () => {
      expect(isSecretFile('.env.local')).toBe(true);
    });

    it('should return true for .env.production', () => {
      expect(isSecretFile('.env.production')).toBe(true);
    });

    it('should return false for regular files', () => {
      expect(isSecretFile('package.json')).toBe(false);
      expect(isSecretFile('index.ts')).toBe(false);
      expect(isSecretFile('.gitignore')).toBe(false);
    });

    it('should return false for files starting with .env but not matching pattern', () => {
      expect(isSecretFile('.env-backup')).toBe(false);
    });
  });

  describe('findSecretFiles', () => {
    it('should find secret files in the specified directory', async () => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gemini-cli-secrets-test-'),
      );
      fs.writeFileSync(path.join(dir, '.env'), 'secret');
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      const srcDir = path.join(dir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, '.env.local'), 'secret2');

      const secrets = await findSecretFiles(dir, 2);
      expect(secrets).toContain(path.join(dir, '.env'));
      expect(secrets).toContain(path.join(srcDir, '.env.local'));
      expect(secrets).not.toContain(path.join(dir, 'package.json'));

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('should respect maxDepth and not scan deeply nested folders beyond the limit', async () => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gemini-cli-secrets-depth-test-'),
      );
      const nestedDir = path.join(dir, 'a', 'b', 'c');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(path.join(nestedDir, '.env'), 'secret');

      const secretsShallow = await findSecretFiles(dir, 1);
      expect(secretsShallow).toEqual([]);

      const secretsDeep = await findSecretFiles(dir, 4);
      expect(secretsDeep).toContain(path.join(nestedDir, '.env'));

      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('should skip ignored directories like node_modules', async () => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gemini-cli-secrets-ignore-test-'),
      );
      const nodeModulesDir = path.join(dir, 'node_modules');
      fs.mkdirSync(nodeModulesDir);
      fs.writeFileSync(path.join(nodeModulesDir, '.env'), 'secret');

      const secrets = await findSecretFiles(dir, 2);
      expect(secrets).toEqual([]);

      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('prepareCommand', () => {
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
        expect.stringMatching(/gemini-cli-sandbox-[^/\\]+[/\\]forbidden\.txt$/),
        '--allowed-manifest',
        expect.stringMatching(/gemini-cli-sandbox-[^/\\]+[/\\]allowed\.txt$/),
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
      const persistentPath = path.resolve('/persistent/path');
      const mockPolicyManager = {
        getCommandPermissions: vi.fn().mockReturnValue({
          fileSystem: { write: [persistentPath] },
          network: true,
        }),
      } as unknown as SandboxPolicyManager;

      vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);

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

      const writeFileSyncCalls = vi.mocked(fs.promises.writeFile).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]allowed\.txt$/),
      );
      expect(aclCall).toBeDefined();
      expect(aclCall![1]).toContain(`${persistentPath}`);
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

        const writeFileSyncCalls = vi.mocked(fs.promises.writeFile).mock.calls;
        const aclCall = writeFileSyncCalls.find((call) =>
          String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]allowed\.txt$/),
        );
        expect(aclCall).toBeDefined();
        expect(aclCall![1]).toContain(`${path.resolve(testCwd)}`);
        expect(aclCall![1]).toContain(`${path.resolve(allowedPath)}`);
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

        const writeFileSyncCalls = vi.mocked(fs.promises.writeFile).mock.calls;
        const aclCall = writeFileSyncCalls.find((call) =>
          String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]allowed\.txt$/),
        );
        expect(aclCall).toBeDefined();
        expect(aclCall![1]).toContain(`${path.resolve(extraWritePath)}`);
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

        vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
        await manager.prepareCommand(req);

        const writeFileSyncCalls = vi.mocked(fs.promises.writeFile).mock.calls;
        const aclCall = writeFileSyncCalls.find((call) =>
          String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]allowed\.txt$/),
        );
        if (aclCall) {
          expect(aclCall[1]).not.toContain(`${uncPath}`);
        }
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

        vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
        await manager.prepareCommand(req);

        const writeFileSyncCalls = vi.mocked(fs.promises.writeFile).mock.calls;
        const aclCall = writeFileSyncCalls.find((call) =>
          String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]allowed\.txt$/),
        );
        expect(aclCall).toBeDefined();
        expect(aclCall![1]).toContain(`${longPath}`);
        expect(aclCall![1]).toContain(`${devicePath}`);
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

      // Should have included the missing path in the forbidden manifest regardless
      // C# helper will ignore non-existent files.
      const writeFileSyncCalls = vi.mocked(fs.promises.writeFile).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]forbidden\.txt$/),
      );
      if (aclCall) {
        expect(aclCall[1]).toContain(`${path.resolve(missingPath)}`);
      }
    });

    it('should deny access to discovered secret files (e.g., .env)', async () => {
      const envFile = path.join(testCwd, '.env');
      fs.writeFileSync(envFile, 'API_KEY=secret');

      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: testCwd,
        env: {},
      };

      await manager.prepareCommand(req);

      const writeFileSyncCalls = vi.mocked(fs.promises.writeFile).mock.calls;
      const aclCall = writeFileSyncCalls.find((call) =>
        String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]forbidden\.txt$/),
      );
      expect(aclCall).toBeDefined();
      expect(aclCall![1]).toContain(`${path.resolve(envFile)}`);
    });

    it('should deny Low Integrity access to forbidden paths', async () => {
      const forbiddenPath = path.join(os.tmpdir(), 'gemini-cli-test-forbidden');
      if (!fs.existsSync(forbiddenPath)) {
        fs.mkdirSync(forbiddenPath);
      }
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

        const writeFileSyncCalls = vi.mocked(fs.promises.writeFile).mock.calls;
        const aclCall = writeFileSyncCalls.find((call) =>
          String(call[0]).match(
            /gemini-cli-sandbox-[^/\\]+[/\\]forbidden\.txt$/,
          ),
        );
        expect(aclCall).toBeDefined();
        expect(aclCall![1]).toContain(`${path.resolve(forbiddenPath)}`);
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

        const writeFileSyncCalls = vi.mocked(fs.promises.writeFile).mock.calls;
        const allowedCall = writeFileSyncCalls.find((call) =>
          String(call[0]).match(/gemini-cli-sandbox-[^/\\]+[/\\]allowed\.txt$/),
        );
        const forbiddenCall = writeFileSyncCalls.find((call) =>
          String(call[0]).match(
            /gemini-cli-sandbox-[^/\\]+[/\\]forbidden\.txt$/,
          ),
        );
        expect(allowedCall).toBeDefined();
        expect(forbiddenCall).toBeDefined();

        // Ensure that forbidden paths are not included in the allowed manifest,
        // as WindowsSandboxManager filters them out to prevent conflicting ACLs.
        expect(String(allowedCall![1])).not.toContain(
          `${path.resolve(conflictPath)}`,
        );
        expect(String(forbiddenCall![1])).toContain(
          `${path.resolve(conflictPath)}`,
        );
      } finally {
        fs.rmSync(conflictPath, { recursive: true, force: true });
      }
    });
  });
});
