/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WindowsSandboxManager } from './windowsSandboxManager.js';
import { SandboxRequest } from './sandboxManager.js';
import * as os from 'node:os';

describe('WindowsSandboxManager', () => {
  const manager = new WindowsSandboxManager();

  it.skipIf(os.platform() !== 'win32')('should prepare a GeminiSandbox.exe command', async () => {
    const req: SandboxRequest = {
      command: 'whoami',
      args: ['/groups'],
      cwd: process.cwd(),
      env: { TEST_VAR: 'test_value' },
      config: {
          networkAccess: false
      }
    };

    const result = await manager.prepareCommand(req);

    expect(result.program).toContain('GeminiSandbox.exe');
    expect(result.args).toEqual(expect.arrayContaining(['0', process.cwd(), 'whoami', '/groups']));
  });

  it.skipIf(os.platform() !== 'win32')('should handle networkAccess from config', async () => {
    const req: SandboxRequest = {
      command: 'whoami',
      args: [],
      cwd: process.cwd(),
      env: {},
      config: {
          networkAccess: true
      }
    };

    const result = await manager.prepareCommand(req);
    expect(result.args[0]).toBe('1');
  });
});
