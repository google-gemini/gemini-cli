/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoopSandboxManager } from './sandboxManager.js';
import { createSandboxManager } from './sandboxManagerFactory.js';
import { LinuxSandboxManager } from '../sandbox/linux/LinuxSandboxManager.js';
import { MacOsSandboxManager } from '../sandbox/macos/MacOsSandboxManager.js';
import { WindowsSandboxManager } from '../sandbox/windows/WindowsSandboxManager.js';

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

describe('SandboxManager', () => {
  afterEach(() => vi.restoreAllMocks());

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
  });
});
