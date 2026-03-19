/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { NoopSandboxManager } from './sandboxManager.js';
import { createSandboxManager } from './sandboxManagerFactory.js';
import { LinuxSandboxManager } from '../sandbox/linux/LinuxSandboxManager.js';
import { MacOsSandboxManager } from '../sandbox/macos/MacOsSandboxManager.js';
import { WindowsSandboxManager } from './windowsSandboxManager.js';

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
      config: {
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
      config: {
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
      config: {
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
