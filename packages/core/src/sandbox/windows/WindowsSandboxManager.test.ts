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
import * as paths from '../../utils/paths.js';
import type { SandboxRequest } from '../../services/sandboxManager.js';
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

  /**
   * Helper to read manifests from sandbox args
   */
  function getManifestPaths(args: string[]): {
    forbidden: string[];
    allowed: string[];
  } {
    const forbiddenPath = args[3];
    const allowedPath = args[5];
    const forbidden = fs
      .readFileSync(forbiddenPath, 'utf8')
      .split('\n')
      .filter(Boolean);
    const allowed = fs
      .readFileSync(allowedPath, 'utf8')
      .split('\n')
      .filter(Boolean);
    return { forbidden, allowed };
  }

  beforeEach(() => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.spyOn(paths, 'resolveToRealPath').mockImplementation((p) => p);

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
      expect.stringMatching(/forbidden\.txt$/),
      '--allowed-manifest',
      expect.stringMatching(/allowed\.txt$/),
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

    const result = await manager.prepareCommand(req);
    const { allowed } = getManifestPaths(result.args);

    // Should NOT have drive roots (C:\, D:\, etc.) in the allowed manifest
    const driveRoots = allowed.filter((p) => /^[A-Z]:\\$/.test(p));
    expect(driveRoots).toHaveLength(0);
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

    const { allowed } = getManifestPaths(result.args);
    expect(allowed).toContain(persistentPath);
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

  it('should include the workspace and allowed paths in the allowed manifest', async () => {
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

      const result = await manager.prepareCommand(req);
      const { allowed } = getManifestPaths(result.args);

      expect(allowed).toContain(testCwd);
      expect(allowed).toContain(allowedPath);
    } finally {
      fs.rmSync(allowedPath, { recursive: true, force: true });
    }
  });

  it('should exclude git worktree paths from the allowed manifest (enforce read-only)', async () => {
    const worktreeGitDir = createTempDir('worktree-git');
    const mainGitDir = createTempDir('main-git');

    try {
      vi.spyOn(sandboxManager, 'resolveSandboxPaths').mockResolvedValue({
        workspace: { original: testCwd, resolved: testCwd },
        forbidden: [],
        globalIncludes: [],
        policyAllowed: [],
        policyRead: [],
        policyWrite: [],
        gitWorktree: {
          worktreeGitDir,
          mainGitDir,
        },
      });

      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: testCwd,
        env: {},
      };

      const result = await manager.prepareCommand(req);
      const { allowed } = getManifestPaths(result.args);

      // Verify that the git directories are NOT in the allowed manifest
      expect(allowed).not.toContain(worktreeGitDir);
      expect(allowed).not.toContain(mainGitDir);
    } finally {
      fs.rmSync(worktreeGitDir, { recursive: true, force: true });
      fs.rmSync(mainGitDir, { recursive: true, force: true });
    }
  });

  it('should include additional write paths in the allowed manifest', async () => {
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

      const result = await manager.prepareCommand(req);
      const { allowed } = getManifestPaths(result.args);

      expect(allowed).toContain(extraWritePath);
    } finally {
      fs.rmSync(extraWritePath, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'win32')(
    'should reject UNC paths for allowed access',
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
    },
  );

  it.runIf(process.platform === 'win32')(
    'should include extended-length and local device paths in the allowed manifest',
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

      const result = await manager.prepareCommand(req);
      const { allowed } = getManifestPaths(result.args);

      expect(allowed).toContain(path.resolve(longPath));
      expect(allowed).toContain(path.resolve(devicePath));
    },
  );

  it('includes non-existent forbidden paths in the forbidden manifest', async () => {
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

    const result = await managerWithForbidden.prepareCommand(req);
    const { forbidden } = getManifestPaths(result.args);

    expect(forbidden).toContain(path.resolve(missingPath));
  });

  it('should include forbidden paths in the forbidden manifest', async () => {
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

      const result = await managerWithForbidden.prepareCommand(req);
      const { forbidden } = getManifestPaths(result.args);

      expect(forbidden).toContain(forbiddenPath);
    } finally {
      fs.rmSync(forbiddenPath, { recursive: true, force: true });
    }
  });

  it('should exclude forbidden paths from the allowed manifest if a conflict exists', async () => {
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

      const result = await managerWithForbidden.prepareCommand(req);
      const { forbidden, allowed } = getManifestPaths(result.args);

      // Conflict should have been filtered out of allow calls
      expect(allowed).not.toContain(conflictPath);
      expect(forbidden).toContain(conflictPath);
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

    // [network, cwd, --forbidden-manifest, fPath, --allowed-manifest, aPath, command, ...args]
    expect(result.args[6]).toBe('__write');
    expect(result.args[7]).toBe(filePath);
  });

  it('should safely handle special characters in internal command paths', async () => {
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
    expect(result.args[6]).toBe('__write');
    expect(result.args[7]).toBe(maliciousPath);
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

    expect(result.args[6]).toBe('__read');
    expect(result.args[7]).toBe(filePath);
  });

  it('should return a cleanup function that deletes the temporary manifest directory', async () => {
    const req: SandboxRequest = {
      command: 'test',
      args: [],
      cwd: testCwd,
      env: {},
    };

    const result = await manager.prepareCommand(req);
    const forbiddenManifestPath = result.args[3];
    const allowedManifestPath = result.args[5];

    expect(fs.existsSync(forbiddenManifestPath)).toBe(true);
    expect(fs.existsSync(allowedManifestPath)).toBe(true);
    expect(result.cleanup).toBeDefined();

    result.cleanup?.();
    expect(fs.existsSync(forbiddenManifestPath)).toBe(false);
    expect(fs.existsSync(allowedManifestPath)).toBe(false);
    expect(fs.existsSync(path.dirname(forbiddenManifestPath))).toBe(false);
  });
});
