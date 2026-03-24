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
import type { SandboxRequest } from '../../services/sandboxManager.js';
import { spawnAsync } from '../../utils/shell-utils.js';

vi.mock('../../utils/shell-utils.js', () => ({
  spawnAsync: vi.fn(),
}));

describe('WindowsSandboxManager', () => {
  let manager: WindowsSandboxManager;
  let testCwd: string;

  beforeEach(() => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    testCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-test-'));
    manager = new WindowsSandboxManager({ workspace: testCwd });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(testCwd, { recursive: true, force: true });
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
    expect(result.args).toEqual(['0', testCwd, 'whoami', '/groups']);
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

      expect(spawnAsync).toHaveBeenCalledWith('icacls', [
        path.resolve(testCwd),
        '/setintegritylevel',
        'Low',
      ]);

      expect(spawnAsync).toHaveBeenCalledWith('icacls', [
        path.resolve(allowedPath),
        '/setintegritylevel',
        'Low',
      ]);
    } finally {
      fs.rmSync(allowedPath, { recursive: true, force: true });
    }
  });
});
