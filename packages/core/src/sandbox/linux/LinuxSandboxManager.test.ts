/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LinuxSandboxManager } from './LinuxSandboxManager.js';
import type { SandboxRequest } from '../../services/sandboxManager.js';

describe('LinuxSandboxManager', () => {
  const workspace = '/home/user/workspace';
  let manager: LinuxSandboxManager;

  beforeEach(() => {
    manager = new LinuxSandboxManager({ workspace });
  });

  const getBwrapArgs = async (req: SandboxRequest) => {
    const result = await manager.prepareCommand(req);
    expect(result.program).toBe('sh');
    expect(result.args[0]).toBe('-c');
    expect(result.args[1]).toBe(
      'bpf_path="$1"; shift; exec bwrap "$@" 9< "$bpf_path"',
    );
    expect(result.args[2]).toBe('_');
    expect(result.args[3]).toMatch(/gemini-cli-seccomp-.*\.bpf$/);
    return result.args.slice(4);
  };

  it('correctly outputs bwrap as the program with appropriate isolation flags', async () => {
    const bwrapArgs = await getBwrapArgs({
      command: 'ls',
      args: ['-la'],
      cwd: workspace,
      env: {},
    });

    expect(bwrapArgs).toEqual([
      '--unshare-all',
      '--new-session',
      '--die-with-parent',
      '--ro-bind',
      '/',
      '/',
      '--dev',
      '/dev',
      '--proc',
      '/proc',
      '--tmpfs',
      '/tmp',
      '--bind',
      workspace,
      workspace,
      '--seccomp',
      '9',
      '--',
      'ls',
      '-la',
    ]);
  });

  it('maps allowedPaths to bwrap binds', async () => {
    const bwrapArgs = await getBwrapArgs({
      command: 'node',
      args: ['script.js'],
      cwd: workspace,
      env: {},
      policy: {
        allowedPaths: ['/tmp/cache', '/opt/tools', workspace],
      },
    });

    // Verify the specific bindings were added correctly
    const bindsIndex = bwrapArgs.indexOf('--seccomp');
    const binds = bwrapArgs.slice(bwrapArgs.indexOf('--bind'), bindsIndex);

    expect(binds).toEqual([
      '--bind',
      workspace,
      workspace,
      '--bind-try',
      '/tmp/cache',
      '/tmp/cache',
      '--bind-try',
      '/opt/tools',
      '/opt/tools',
    ]);
  });

  it('should not bind the workspace twice even if it has a trailing slash in allowedPaths', async () => {
    const bwrapArgs = await getBwrapArgs({
      command: 'ls',
      args: ['-la'],
      cwd: workspace,
      env: {},
      policy: {
        allowedPaths: [workspace + '/'],
      },
    });

    const bindsIndex = bwrapArgs.indexOf('--seccomp');
    const binds = bwrapArgs.slice(bwrapArgs.indexOf('--bind'), bindsIndex);

    // Should only contain the primary workspace bind, not the second one with a trailing slash
    expect(binds).toEqual(['--bind', workspace, workspace]);
  });
});
