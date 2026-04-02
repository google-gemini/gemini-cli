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
  sanitizePaths,
  findSecretFiles,
  isSecretFile,
  tryRealpath,
  resolveSandboxPaths,
  getPathIdentity,
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
    },
    readdir: vi.fn(),
    realpath: vi.fn(),
    stat: vi.fn(),
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
    vi.mocked(fsPromises.readdir).mockImplementation(((dir: string) => {
      if (dir === '/workspace') {
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

    const secrets = await findSecretFiles('/workspace');
    expect(secrets).toEqual([path.join('/workspace', '.env')]);
  });

  it('should NOT find secret files recursively (shallow scan only)', async () => {
    vi.mocked(fsPromises.readdir).mockImplementation(((dir: string) => {
      if (dir === '/workspace') {
        return Promise.resolve([
          { name: '.env', isDirectory: () => false, isFile: () => true },
          { name: 'packages', isDirectory: () => true, isFile: () => false },
        ] as unknown as fs.Dirent[]);
      }
      if (dir === path.join('/workspace', 'packages')) {
        return Promise.resolve([
          { name: '.env.local', isDirectory: () => false, isFile: () => true },
        ] as unknown as fs.Dirent[]);
      }
      return Promise.resolve([] as unknown as fs.Dirent[]);
    }) as unknown as typeof fsPromises.readdir);

    const secrets = await findSecretFiles('/workspace');
    expect(secrets).toEqual([path.join('/workspace', '.env')]);
    // Should NOT have called readdir for subdirectories
    expect(fsPromises.readdir).toHaveBeenCalledTimes(1);
    expect(fsPromises.readdir).not.toHaveBeenCalledWith(
      path.join('/workspace', 'packages'),
      expect.anything(),
    );
  });
});

describe('SandboxManager', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('sanitizePaths', () => {
    it('should return an empty array if no paths are provided', () => {
      expect(sanitizePaths(undefined)).toEqual([]);
      expect(sanitizePaths(null)).toEqual([]);
      expect(sanitizePaths([])).toEqual([]);
    });

    it('should deduplicate paths and return them', () => {
      const paths = ['/workspace/foo', '/workspace/bar', '/workspace/foo'];
      expect(sanitizePaths(paths)).toEqual([
        '/workspace/foo',
        '/workspace/bar',
      ]);
    });

    it('should deduplicate case-insensitively on Windows and macOS', () => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');
      const paths = ['/workspace/foo', '/WORKSPACE/FOO'];
      expect(sanitizePaths(paths)).toEqual(['/workspace/foo']);

      vi.spyOn(os, 'platform').mockReturnValue('darwin');
      const macPaths = ['/tmp/foo', '/tmp/FOO'];
      expect(sanitizePaths(macPaths)).toEqual(['/tmp/foo']);

      vi.spyOn(os, 'platform').mockReturnValue('linux');
      const linuxPaths = ['/tmp/foo', '/tmp/FOO'];
      expect(sanitizePaths(linuxPaths)).toEqual(['/tmp/foo', '/tmp/FOO']);
    });

    it('should throw an error if a path is not absolute', () => {
      const paths = ['/workspace/foo', 'relative/path'];
      expect(() => sanitizePaths(paths)).toThrow(
        'Sandbox path must be absolute: relative/path',
      );
    });
  });

  describe('getPathIdentity', () => {
    it('should normalize slashes and strip trailing slashes', () => {
      expect(getPathIdentity('/foo/bar//baz/')).toBe(
        path.normalize('/foo/bar/baz'),
      );
    });

    it('should handle case sensitivity correctly per platform', () => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');
      expect(getPathIdentity('/Workspace/Foo')).toBe('/workspace/foo');

      vi.spyOn(os, 'platform').mockReturnValue('darwin');
      expect(getPathIdentity('/Tmp/Foo')).toBe('/tmp/foo');

      vi.spyOn(os, 'platform').mockReturnValue('linux');
      expect(getPathIdentity('/Tmp/Foo')).toBe('/Tmp/Foo');
    });
  });

  describe('resolveSandboxPaths', () => {
    it('should resolve allowed and forbidden paths', async () => {
      const options = {
        workspace: '/workspace',
        forbiddenPaths: async () => ['/workspace/forbidden'],
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: '/workspace',
        env: {},
        policy: {
          allowedPaths: ['/workspace/allowed'],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.allowed).toEqual(['/workspace/allowed']);
      expect(result.forbidden).toEqual(['/workspace/forbidden']);
    });

    it('should filter out workspace from allowed paths', async () => {
      const options = {
        workspace: '/workspace',
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: '/workspace',
        env: {},
        policy: {
          allowedPaths: ['/workspace', '/workspace/', '/other/path'],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.allowed).toEqual(['/other/path']);
    });

    it('should prioritize forbidden paths over allowed paths', async () => {
      const options = {
        workspace: '/workspace',
        forbiddenPaths: async () => ['/workspace/secret'],
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: '/workspace',
        env: {},
        policy: {
          allowedPaths: ['/workspace/secret', '/workspace/normal'],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.allowed).toEqual(['/workspace/normal']);
      expect(result.forbidden).toEqual(['/workspace/secret']);
    });

    it('should handle case-insensitive conflicts on supported platforms', async () => {
      vi.spyOn(os, 'platform').mockReturnValue('darwin');
      const options = {
        workspace: '/workspace',
        forbiddenPaths: async () => ['/workspace/SECRET'],
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: '/workspace',
        env: {},
        policy: {
          allowedPaths: ['/workspace/secret'],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.allowed).toEqual([]);
      expect(result.forbidden).toEqual(['/workspace/SECRET']);
    });
  });

  describe('tryRealpath', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return the realpath if the file exists', async () => {
      vi.mocked(fsPromises.realpath).mockResolvedValue(
        '/real/path/to/file.txt' as never,
      );
      const result = await tryRealpath('/some/symlink/to/file.txt');
      expect(result).toBe('/real/path/to/file.txt');
      expect(fsPromises.realpath).toHaveBeenCalledWith(
        '/some/symlink/to/file.txt',
      );
    });

    it('should fallback to parent directory if file does not exist (ENOENT)', async () => {
      vi.mocked(fsPromises.realpath).mockImplementation(((p: string) => {
        if (p === '/workspace/nonexistent.txt') {
          return Promise.reject(
            Object.assign(new Error('ENOENT: no such file or directory'), {
              code: 'ENOENT',
            }),
          );
        }
        if (p === '/workspace') {
          return Promise.resolve('/real/workspace');
        }
        return Promise.reject(new Error(`Unexpected path: ${p}`));
      }) as never);

      const result = await tryRealpath('/workspace/nonexistent.txt');

      // It should combine the real path of the parent with the original basename
      expect(result).toBe(path.join('/real/workspace', 'nonexistent.txt'));
    });

    it('should recursively fallback up the directory tree on multiple ENOENT errors', async () => {
      vi.mocked(fsPromises.realpath).mockImplementation(((p: string) => {
        if (p === '/workspace/missing_dir/missing_file.txt') {
          return Promise.reject(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
          );
        }
        if (p === '/workspace/missing_dir') {
          return Promise.reject(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
          );
        }
        if (p === '/workspace') {
          return Promise.resolve('/real/workspace');
        }
        return Promise.reject(new Error(`Unexpected path: ${p}`));
      }) as never);

      const result = await tryRealpath(
        '/workspace/missing_dir/missing_file.txt',
      );

      // It should resolve '/workspace' to '/real/workspace' and append the missing parts
      expect(result).toBe(
        path.join('/real/workspace', 'missing_dir', 'missing_file.txt'),
      );
    });

    it('should return the path unchanged if it reaches the root directory and it still does not exist', async () => {
      const rootPath = path.resolve('/');
      vi.mocked(fsPromises.realpath).mockImplementation(() =>
        Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
      );

      const result = await tryRealpath(rootPath);
      expect(result).toBe(rootPath);
    });

    it('should throw an error if realpath fails with a non-ENOENT error (e.g. EACCES)', async () => {
      vi.mocked(fsPromises.realpath).mockImplementation(() =>
        Promise.reject(
          Object.assign(new Error('EACCES: permission denied'), {
            code: 'EACCES',
          }),
        ),
      );

      await expect(tryRealpath('/secret/file.txt')).rejects.toThrow(
        'EACCES: permission denied',
      );
    });
  });

  describe('NoopSandboxManager', () => {
    const sandboxManager = new NoopSandboxManager();

    it('should pass through the command and arguments unchanged', async () => {
      const req = {
        command: 'ls',
        args: ['-la'],
        cwd: '/tmp',
        env: { PATH: '/usr/bin' },
      };

      const result = await sandboxManager.prepareCommand(req);

      expect(result.program).toBe('ls');
      expect(result.args).toEqual(['-la']);
    });

    it('should sanitize the environment variables', async () => {
      const req = {
        command: 'echo',
        args: ['hello'],
        cwd: '/tmp',
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
      const req = {
        command: 'echo',
        args: ['hello'],
        cwd: '/tmp',
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
      const req = {
        command: 'echo',
        args: ['hello'],
        cwd: '/tmp',
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
      const req = {
        command: 'echo',
        args: ['hello'],
        cwd: '/tmp',
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
        { workspace: '/workspace' },
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
          { workspace: '/workspace' },
        );
        expect(manager).toBeInstanceOf(expected);
      },
    );

    it('should return WindowsSandboxManager if sandboxing is enabled on win32', () => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');
      const manager = createSandboxManager(
        { enabled: true },
        { workspace: '/workspace' },
      );
      expect(manager).toBeInstanceOf(WindowsSandboxManager);
    });
  });
});
