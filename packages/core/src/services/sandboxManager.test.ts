/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import {
  NoopSandboxManager,
  findSecretFiles,
  isSecretFile,
  resolveSandboxPaths,
  type SandboxRequest,
} from './sandboxManager.js';
import { createSandboxManager } from './sandboxManagerFactory.js';
import { LinuxSandboxManager } from '../sandbox/linux/LinuxSandboxManager.js';
import { MacOsSandboxManager } from '../sandbox/macos/MacOsSandboxManager.js';
import { WindowsSandboxManager } from '../sandbox/windows/WindowsSandboxManager.js';
import type fs from 'node:fs';

vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  return {
    ...actual,
    default: {
      ...actual,
      readdir: vi.fn(),
      realpath: vi.fn(),
      stat: vi.fn(),
      lstat: vi.fn(),
      readFile: vi.fn(),
    },
    readdir: vi.fn(),
    realpath: vi.fn(),
    stat: vi.fn(),
    lstat: vi.fn(),
    readFile: vi.fn(),
  };
});

vi.mock('../utils/paths.js', async () => {
  const actual =
    await vi.importActual<typeof import('../utils/paths.js')>(
      '../utils/paths.js',
    );
  return {
    ...actual,
    resolveToRealPath: vi.fn((p) => p),
  };
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
    // This depends on the pattern ".env.*". ".env-backup" would match ".env*" but not ".env.*"
    expect(isSecretFile('.env-backup')).toBe(false);
  });
});

describe('findSecretFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should find secret files in the root directory', async () => {
    const workspace = path.resolve('/workspace');
    vi.mocked(fsPromises.readdir).mockImplementation(((dir: string) => {
      if (dir === workspace) {
        return Promise.resolve([
          { name: '.env', isDirectory: () => false, isFile: () => true },
          {
            name: 'package.json',
            isDirectory: () => false,
            isFile: () => true,
          },
          { name: 'src', isDirectory: () => true, isFile: () => false },
        ] as unknown as fs.Dirent[]);
      }
      return Promise.resolve([] as unknown as fs.Dirent[]);
    }) as unknown as typeof fsPromises.readdir);

    const secrets = await findSecretFiles(workspace);
    expect(secrets).toEqual([path.join(workspace, '.env')]);
  });

  it('should NOT find secret files recursively (shallow scan only)', async () => {
    const workspace = path.resolve('/workspace');
    vi.mocked(fsPromises.readdir).mockImplementation(((dir: string) => {
      if (dir === workspace) {
        return Promise.resolve([
          { name: '.env', isDirectory: () => false, isFile: () => true },
          { name: 'packages', isDirectory: () => true, isFile: () => false },
        ] as unknown as fs.Dirent[]);
      }
      if (dir === path.join(workspace, 'packages')) {
        return Promise.resolve([
          { name: '.env.local', isDirectory: () => false, isFile: () => true },
        ] as unknown as fs.Dirent[]);
      }
      return Promise.resolve([] as unknown as fs.Dirent[]);
    }) as unknown as typeof fsPromises.readdir);

    const secrets = await findSecretFiles(workspace);
    expect(secrets).toEqual([path.join(workspace, '.env')]);
    // Should NOT have called readdir for subdirectories
    expect(fsPromises.readdir).toHaveBeenCalledTimes(1);
    expect(fsPromises.readdir).not.toHaveBeenCalledWith(
      path.join(workspace, 'packages'),
      expect.anything(),
    );
  });
});

describe('SandboxManager', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('resolveSandboxPaths', () => {
    it('should resolve allowed and forbidden paths', async () => {
      const workspace = path.resolve('/workspace');
      const forbidden = path.join(workspace, 'forbidden');
      const allowed = path.join(workspace, 'allowed');
      const options = {
        workspace,
        forbiddenPaths: async () => [forbidden],
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: workspace,
        env: {},
        policy: {
          allowedPaths: [allowed],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.policyAllowed).toEqual([allowed]);
      expect(result.forbidden).toEqual([forbidden]);
    });

    it('should filter out workspace from allowed paths', async () => {
      const workspace = path.resolve('/workspace');
      const other = path.resolve('/other/path');
      const options = {
        workspace,
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: workspace,
        env: {},
        policy: {
          allowedPaths: [workspace, workspace + path.sep, other],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.policyAllowed).toEqual([other]);
    });

    it('should prioritize forbidden paths over allowed paths', async () => {
      const workspace = path.resolve('/workspace');
      const secret = path.join(workspace, 'secret');
      const normal = path.join(workspace, 'normal');
      const options = {
        workspace,
        forbiddenPaths: async () => [secret],
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: workspace,
        env: {},
        policy: {
          allowedPaths: [secret, normal],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.policyAllowed).toEqual([normal]);
      expect(result.forbidden).toEqual([secret]);
    });

    it('should handle case-insensitive conflicts on supported platforms', async () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
      const workspace = path.resolve('/workspace');
      const secretUpper = path.join(workspace, 'SECRET');
      const secretLower = path.join(workspace, 'secret');
      const options = {
        workspace,
        forbiddenPaths: async () => [secretUpper],
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: workspace,
        env: {},
        policy: {
          allowedPaths: [secretLower],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.policyAllowed).toEqual([]);
      expect(result.forbidden).toEqual([secretUpper]);
    });
  });

  describe('NoopSandboxManager', () => {
    const sandboxManager = new NoopSandboxManager();

    it('should pass through the command and arguments unchanged', async () => {
      const cwd = path.resolve('/tmp');
      const req = {
        command: 'ls',
        args: ['-la'],
        cwd,
        env: { PATH: '/usr/bin' },
      };

      const result = await sandboxManager.prepareCommand(req);

      expect(result.program).toBe('ls');
      expect(result.args).toEqual(['-la']);
    });

    it('should sanitize the environment variables', async () => {
      const cwd = path.resolve('/tmp');
      const req = {
        command: 'echo',
        args: ['hello'],
        cwd,
        env: {
          PATH: '/usr/bin',
          GITHUB_TOKEN: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          MY_SECRET: 'super-secret',
          SAFE_VAR: 'is-safe',
        },
        policy: {
          sanitizationConfig: {
            enableEnvironmentVariableRedaction: true,
          },
        },
      };

      const result = await sandboxManager.prepareCommand(req);

      expect(result.env['PATH']).toBe('/usr/bin');
      expect(result.env['SAFE_VAR']).toBe('is-safe');
      expect(result.env['GITHUB_TOKEN']).toBeUndefined();
      expect(result.env['MY_SECRET']).toBeUndefined();
    });

    it('should allow disabling environment variable redaction if requested in config', async () => {
      const cwd = path.resolve('/tmp');
      const req = {
        command: 'echo',
        args: ['hello'],
        cwd,
        env: {
          API_KEY: 'sensitive-key',
        },
        policy: {
          sanitizationConfig: {
            enableEnvironmentVariableRedaction: false,
          },
        },
      };

      const result = await sandboxManager.prepareCommand(req);

      // API_KEY should be preserved because redaction was explicitly disabled
      expect(result.env['API_KEY']).toBe('sensitive-key');
    });

    it('should respect allowedEnvironmentVariables in config but filter sensitive ones', async () => {
      const cwd = path.resolve('/tmp');
      const req = {
        command: 'echo',
        args: ['hello'],
        cwd,
        env: {
          MY_SAFE_VAR: 'safe-value',
          MY_TOKEN: 'secret-token',
        },
        policy: {
          sanitizationConfig: {
            allowedEnvironmentVariables: ['MY_SAFE_VAR', 'MY_TOKEN'],
            enableEnvironmentVariableRedaction: true,
          },
        },
      };

      const result = await sandboxManager.prepareCommand(req);

      expect(result.env['MY_SAFE_VAR']).toBe('safe-value');
      // MY_TOKEN matches /TOKEN/i so it should be redacted despite being allowed in config
      expect(result.env['MY_TOKEN']).toBeUndefined();
    });

    it('should respect blockedEnvironmentVariables in config', async () => {
      const cwd = path.resolve('/tmp');
      const req = {
        command: 'echo',
        args: ['hello'],
        cwd,
        env: {
          SAFE_VAR: 'safe-value',
          BLOCKED_VAR: 'blocked-value',
        },
        policy: {
          sanitizationConfig: {
            blockedEnvironmentVariables: ['BLOCKED_VAR'],
            enableEnvironmentVariableRedaction: true,
          },
        },
      };

      const result = await sandboxManager.prepareCommand(req);

      expect(result.env['SAFE_VAR']).toBe('safe-value');
      expect(result.env['BLOCKED_VAR']).toBeUndefined();
    });

    it('should delegate isKnownSafeCommand to platform specific checkers', () => {
      vi.spyOn(os, 'platform').mockReturnValue('darwin');
      expect(sandboxManager.isKnownSafeCommand(['ls'])).toBe(true);
      expect(sandboxManager.isKnownSafeCommand(['dir'])).toBe(false);

      vi.spyOn(os, 'platform').mockReturnValue('win32');
      expect(sandboxManager.isKnownSafeCommand(['dir'])).toBe(true);
    });

    it('should delegate isDangerousCommand to platform specific checkers', () => {
      vi.spyOn(os, 'platform').mockReturnValue('darwin');
      expect(sandboxManager.isDangerousCommand(['rm', '-rf', '.'])).toBe(true);
      expect(sandboxManager.isDangerousCommand(['del'])).toBe(false);

      vi.spyOn(os, 'platform').mockReturnValue('win32');
      expect(sandboxManager.isDangerousCommand(['del'])).toBe(true);
    });
  });

  describe('createSandboxManager', () => {
    it('should return NoopSandboxManager if sandboxing is disabled', () => {
      const manager = createSandboxManager(
        { enabled: false },
        { workspace: path.resolve('/workspace') },
      );
      expect(manager).toBeInstanceOf(NoopSandboxManager);
    });

    it.each([
      { platform: 'linux', expected: LinuxSandboxManager },
      { platform: 'darwin', expected: MacOsSandboxManager },
      { platform: 'win32', expected: WindowsSandboxManager },
    ] as const)(
      'should return $expected.name if sandboxing is enabled and platform is $platform',
      ({ platform, expected }) => {
        vi.spyOn(os, 'platform').mockReturnValue(platform);
        const manager = createSandboxManager(
          { enabled: true },
          { workspace: path.resolve('/workspace') },
        );
        expect(manager).toBeInstanceOf(expected);
      },
    );

    it('should return WindowsSandboxManager if sandboxing is enabled on win32', () => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');
      const manager = createSandboxManager(
        { enabled: true },
        { workspace: path.resolve('/workspace') },
      );
      expect(manager).toBeInstanceOf(WindowsSandboxManager);
    });
  });
});
