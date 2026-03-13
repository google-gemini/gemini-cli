/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { NoopSandboxManager } from './sandboxManager.js';

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

  it('should allow disabling environment variable redaction if requested in config', async () => {
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

    expect(result.env['API_KEY']).toBe('sensitive-key');
  });

  it('should respect allowedEnvironmentVariables in config', async () => {
    const req = {
      command: 'echo',
      args: ['hello'],
      cwd: '/tmp',
      env: {
        MY_TOKEN: 'secret-token',
        OTHER_SECRET: 'another-secret',
      },
      config: {
        sanitizationConfig: {
          allowedEnvironmentVariables: ['MY_TOKEN'],
        },
      },
    };

    const result = await sandboxManager.prepareCommand(req);

    expect(result.env['MY_TOKEN']).toBe('secret-token');
    expect(result.env['OTHER_SECRET']).toBeUndefined();
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
