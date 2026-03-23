/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { WindowsSandboxManager } from './windowsSandboxManager.js';
import type { SandboxRequest } from './sandboxManager.js';
import { spawnAsync } from '../utils/shell-utils.js';

vi.mock('../utils/shell-utils.js', () => ({
  spawnAsync: vi.fn(),
}));

describe('WindowsSandboxManager', () => {
  let manager: WindowsSandboxManager;

  beforeEach(() => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    manager = new WindowsSandboxManager({ workspace: '/test/workspace' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should prepare a GeminiSandbox.exe command', async () => {
    const req: SandboxRequest = {
      command: 'whoami',
      args: ['/groups'],
      cwd: '/test/cwd',
      env: { TEST_VAR: 'test_value' },
      policy: {
        networkAccess: false,
      },
    };

    const result = await manager.prepareCommand(req);

    expect(result.program).toContain('GeminiSandbox.exe');
    expect(result.args).toEqual(['0', '/test/cwd', 'whoami', '/groups']);
  });

  it('should handle networkAccess from config', async () => {
    const req: SandboxRequest = {
      command: 'whoami',
      args: [],
      cwd: '/test/cwd',
      env: {},
      policy: {
        networkAccess: true,
      },
    };

    const result = await manager.prepareCommand(req);
    expect(result.args[0]).toBe('1');
  });

  it('should sanitize environment variables', async () => {
    const req: SandboxRequest = {
      command: 'test',
      args: [],
      cwd: '/test/cwd',
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

  it('should grant Low Integrity access to the workspace and allowed paths', async () => {
    const req: SandboxRequest = {
      command: 'test',
      args: [],
      cwd: '/test/cwd',
      env: {},
      policy: {
        allowedPaths: ['/test/allowed1'],
      },
    };

    await manager.prepareCommand(req);

    expect(spawnAsync).toHaveBeenCalledWith('icacls', [
      path.resolve('/test/workspace'),
      '/setintegritylevel',
      'Low',
    ]);

    expect(spawnAsync).toHaveBeenCalledWith('icacls', [
      path.resolve('/test/allowed1'),
      '/setintegritylevel',
      'Low',
    ]);
  });
});
