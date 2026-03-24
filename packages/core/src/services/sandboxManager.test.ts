/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  NoopSandboxManager,
  sanitizePaths,
  findSecretFiles,
  isSecretFile,
} from './sandboxManager.js';
import { createSandboxManager } from './sandboxManagerFactory.js';
import { LinuxSandboxManager } from '../sandbox/linux/LinuxSandboxManager.js';
import { MacOsSandboxManager } from '../sandbox/macos/MacOsSandboxManager.js';
import { WindowsSandboxManager } from '../sandbox/windows/WindowsSandboxManager.js';
import fs from 'node:fs';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      ...actual,
      readdirSync: vi.fn(),
    },
    readdirSync: vi.fn(),
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
    // This depends on the pattern ".env.*". ".env-foo" would match ".env.*" if it was glob,
    // but our implementation uses startsWith(".env.")
    expect(isSecretFile('.env-backup')).toBe(false);
  });
});

describe('findSecretFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should find secret files in the root directory', () => {
    vi.mocked(fs.readdirSync).mockImplementation(((dir: string) => {
      if (dir === '/workspace') {
        return [
          { name: '.env', isDirectory: () => false, isFile: () => true },
          {
            name: 'package.json',
            isDirectory: () => false,
            isFile: () => true,
          },
          { name: 'src', isDirectory: () => true, isFile: () => false },
        ] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
    }) as unknown as typeof fs.readdirSync);

    const secrets = findSecretFiles('/workspace');
    expect(secrets).toEqual([path.join('/workspace', '.env')]);
  });

  it('should NOT find secret files recursively (shallow scan only)', () => {
    vi.mocked(fs.readdirSync).mockImplementation(((dir: string) => {
      if (dir === '/workspace') {
        return [
          { name: '.env', isDirectory: () => false, isFile: () => true },
          { name: 'packages', isDirectory: () => true, isFile: () => false },
        ] as unknown as fs.Dirent[];
      }
      if (dir === path.join('/workspace', 'packages')) {
        return [
          { name: '.env.local', isDirectory: () => false, isFile: () => true },
        ] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
    }) as unknown as typeof fs.readdirSync);

    const secrets = findSecretFiles('/workspace');
    expect(secrets).toEqual([path.join('/workspace', '.env')]);
    // Should NOT have called readdirSync for subdirectories
    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync).not.toHaveBeenCalledWith(
      path.join('/workspace', 'packages'),
      expect.anything(),
    );
  });
});

describe('sanitizePaths', () => {
  it('should return undefined if no paths are provided', () => {
    expect(sanitizePaths(undefined)).toBeUndefined();
  });

  it('should deduplicate paths and return them', () => {
    const paths = ['/workspace/foo', '/workspace/bar', '/workspace/foo'];
    expect(sanitizePaths(paths)).toEqual(['/workspace/foo', '/workspace/bar']);
  });

  it('should throw an error if a path is not absolute', () => {
    const paths = ['/workspace/foo', 'relative/path'];
    expect(() => sanitizePaths(paths)).toThrow(
      'Sandbox path must be absolute: relative/path',
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
});

describe('createSandboxManager', () => {
  it('should return NoopSandboxManager if sandboxing is disabled', () => {
    const manager = createSandboxManager({ enabled: false }, '/workspace');
    expect(manager).toBeInstanceOf(NoopSandboxManager);
  });

  it.each([
    { platform: 'linux', expected: LinuxSandboxManager },
    { platform: 'darwin', expected: MacOsSandboxManager },
    { platform: 'win32', expected: WindowsSandboxManager },
  ] as const)(
    'should return $expected.name if sandboxing is enabled and platform is $platform',
    ({ platform, expected }) => {
      const osSpy = vi.spyOn(os, 'platform').mockReturnValue(platform);
      try {
        const manager = createSandboxManager({ enabled: true }, '/workspace');
        expect(manager).toBeInstanceOf(expected);
      } finally {
        osSpy.mockRestore();
      }
    },
  );
});
