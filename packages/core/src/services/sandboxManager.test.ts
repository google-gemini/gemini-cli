/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import {
  NoopSandboxManager,
  LocalSandboxManager,
  sanitizePaths,
  tryRealpath,
} from './sandboxManager.js';
import { createSandboxManager } from './sandboxManagerFactory.js';
import { LinuxSandboxManager } from '../sandbox/linux/LinuxSandboxManager.js';
import { MacOsSandboxManager } from '../sandbox/macos/MacOsSandboxManager.js';
import { WindowsSandboxManager } from '../sandbox/windows/WindowsSandboxManager.js';

describe('SandboxManager', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('sanitizePaths', () => {
    it('should return undefined if no paths are provided', () => {
      expect(sanitizePaths(undefined)).toBeUndefined();
    });

    it('should deduplicate paths and return them', () => {
      const paths = ['/workspace/foo', '/workspace/bar', '/workspace/foo'];
      expect(sanitizePaths(paths)).toEqual([
        '/workspace/foo',
        '/workspace/bar',
      ]);
    });

    it('should throw an error if a path is not absolute', () => {
      const paths = ['/workspace/foo', 'relative/path'];
      expect(() => sanitizePaths(paths)).toThrow(
        'Sandbox path must be absolute: relative/path',
      );
    });
  });

  describe('tryRealpath', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return the realpath if the file exists', async () => {
      vi.spyOn(fs, 'realpath').mockResolvedValue('/real/path/to/file.txt');
      const result = await tryRealpath('/some/symlink/to/file.txt');
      expect(result).toBe('/real/path/to/file.txt');
      expect(fs.realpath).toHaveBeenCalledWith('/some/symlink/to/file.txt');
    });

    it('should fallback to parent directory if file does not exist (ENOENT)', async () => {
      vi.spyOn(fs, 'realpath').mockImplementation(async (p) => {
        if (p === '/workspace/nonexistent.txt') {
          throw Object.assign(new Error('ENOENT: no such file or directory'), {
            code: 'ENOENT',
          });
        }
        if (p === '/workspace') {
          return '/real/workspace';
        }
        throw new Error(`Unexpected path: ${p}`);
      });

      const result = await tryRealpath('/workspace/nonexistent.txt');

      // It should combine the real path of the parent with the original basename
      expect(result).toBe(path.join('/real/workspace', 'nonexistent.txt'));
    });

    it('should recursively fallback up the directory tree on multiple ENOENT errors', async () => {
      vi.spyOn(fs, 'realpath').mockImplementation(async (p) => {
        if (p === '/workspace/missing_dir/missing_file.txt') {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }
        if (p === '/workspace/missing_dir') {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }
        if (p === '/workspace') {
          return '/real/workspace';
        }
        throw new Error(`Unexpected path: ${p}`);
      });

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
      vi.spyOn(fs, 'realpath').mockImplementation(async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = await tryRealpath(rootPath);
      expect(result).toBe(rootPath);
    });

    it('should throw an error if realpath fails with a non-ENOENT error (e.g. EACCES)', async () => {
      vi.spyOn(fs, 'realpath').mockImplementation(async () => {
        throw Object.assign(new Error('EACCES: permission denied'), {
          code: 'EACCES',
        });
      });

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
      };

      const result = await sandboxManager.prepareCommand(req);

      expect(result.env['PATH']).toBe('/usr/bin');
      expect(result.env['SAFE_VAR']).toBe('is-safe');
      expect(result.env['GITHUB_TOKEN']).toBeUndefined();
      expect(result.env['MY_SECRET']).toBeUndefined();
    });

    it('should NOT allow disabling environment variable redaction if requested in config (vulnerability fix)', async () => {
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

      // API_KEY should be redacted because SandboxManager forces redaction and API_KEY matches NEVER_ALLOWED_NAME_PATTERNS
      expect(result.env['API_KEY']).toBeUndefined();
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
      const manager = createSandboxManager({ enabled: false }, '/workspace');
      expect(manager).toBeInstanceOf(NoopSandboxManager);
    });

    it.each([
      { platform: 'linux', expected: LinuxSandboxManager },
      { platform: 'darwin', expected: MacOsSandboxManager },
    ] as const)(
      'should return $expected.name if sandboxing is enabled and platform is $platform',
      ({ platform, expected }) => {
        vi.spyOn(os, 'platform').mockReturnValue(platform);
        const manager = createSandboxManager({ enabled: true }, '/workspace');
        expect(manager).toBeInstanceOf(expected);
      },
    );

    it("should return WindowsSandboxManager if sandboxing is enabled with 'windows-native' command on win32", () => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');
      const manager = createSandboxManager(
        { enabled: true, command: 'windows-native' },
        '/workspace',
      );
      expect(manager).toBeInstanceOf(WindowsSandboxManager);
    });

    it('should return LocalSandboxManager on win32 if command is not windows-native', () => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');
      const manager = createSandboxManager(
        { enabled: true, command: 'docker' as unknown as 'windows-native' },
        '/workspace',
      );
      expect(manager).toBeInstanceOf(LocalSandboxManager);
    });
  });
});
