/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LinuxSandboxManager } from './LinuxSandboxManager.js';
import type { SandboxRequest } from '../../services/sandboxManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HELPER_PATH = join(__dirname, 'gemini-linux-sandbox-helper');

describe('LinuxSandboxManager', () => {
  const workspace = '/home/user/workspace';

  it('correctly outputs bwrap as the program with appropriate isolation flags', async () => {
    const manager = new LinuxSandboxManager({ workspace });
    const req: SandboxRequest = {
      command: 'ls',
      args: ['-la'],
      cwd: workspace,
      env: {},
    };

    const result = await manager.prepareCommand(req);

    expect(result.program).toBe('bwrap');
    expect(result.args).toEqual([
      '--unshare-all',
      '--ro-bind',
      '/',
      '/',
      '--dev-bind',
      '/dev',
      '/dev',
      '--bind',
      '/dev/pts',
      '/dev/pts',
      '--bind',
      workspace,
      workspace,
      '--',
      HELPER_PATH,
      'ls',
      '-la',
    ]);
  });

  it('maps allowedPaths to bwrap binds', async () => {
    const manager = new LinuxSandboxManager({
      workspace,
      allowedPaths: ['/tmp/cache', '/opt/tools', workspace],
    });
    const req: SandboxRequest = {
      command: 'node',
      args: ['script.js'],
      cwd: workspace,
      env: {},
    };

    const result = await manager.prepareCommand(req);

    expect(result.program).toBe('bwrap');
    expect(result.args).toEqual([
      '--unshare-all',
      '--ro-bind',
      '/',
      '/',
      '--dev-bind',
      '/dev',
      '/dev',
      '--bind',
      '/dev/pts',
      '/dev/pts',
      '--bind',
      workspace,
      workspace,
      '--bind',
      '/tmp/cache',
      '/tmp/cache',
      '--bind',
      '/opt/tools',
      '/opt/tools',
      '--',
      HELPER_PATH,
      'node',
      'script.js',
    ]);
  });
});
