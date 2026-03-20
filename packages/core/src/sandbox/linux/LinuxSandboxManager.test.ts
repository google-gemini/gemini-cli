/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import { type Stats } from 'node:fs';
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

  it('maps forbidden directory paths to bwrap tmpfs', async () => {
    vi.spyOn(fs, 'stat').mockImplementation((p) => {
      if (p === '/test/forbidden_dir')
        return Promise.resolve({ isDirectory: () => true } as Stats);
      const error = new Error('ENOENT');
      Object.assign(error, { code: 'ENOENT' });
      return Promise.reject(error);
    });

    const bwrapArgs = await getBwrapArgs({
      command: 'node',
      args: ['script.js'],
      cwd: workspace,
      env: {},
      policy: {
        forbiddenPaths: ['/test/forbidden_dir'],
      },
    });

    const bindsIndex = bwrapArgs.indexOf('--seccomp');
    const binds = bwrapArgs.slice(bwrapArgs.indexOf('--bind'), bindsIndex);

    expect(binds).toEqual(
      expect.arrayContaining(['--tmpfs', '/test/forbidden_dir']),
    );
  });

  it('maps forbidden file paths to bwrap ro-bind-try with /dev/null', async () => {
    vi.spyOn(fs, 'stat').mockImplementation((p) => {
      if (p === '/test/forbidden_file')
        return Promise.resolve({ isDirectory: () => false } as Stats);
      const error = new Error('ENOENT');
      Object.assign(error, { code: 'ENOENT' });
      return Promise.reject(error);
    });

    const bwrapArgs = await getBwrapArgs({
      command: 'node',
      args: ['script.js'],
      cwd: workspace,
      env: {},
      policy: {
        forbiddenPaths: ['/test/forbidden_file'],
      },
    });

    const bindsIndex = bwrapArgs.indexOf('--seccomp');
    const binds = bwrapArgs.slice(bwrapArgs.indexOf('--bind'), bindsIndex);

    expect(binds).toEqual(
      expect.arrayContaining([
        '--ro-bind-try',
        '/dev/null',
        '/test/forbidden_file',
      ]),
    );
  });

  it('ignores forbiddenPaths when stat throws an error', async () => {
    vi.spyOn(fs, 'stat').mockImplementation(() => {
      const error = new Error('ENOENT');
      Object.assign(error, { code: 'ENOENT' });
      return Promise.reject(error);
    });

    const bwrapArgs = await getBwrapArgs({
      command: 'node',
      args: ['script.js'],
      cwd: workspace,
      env: {},
      policy: {
        forbiddenPaths: ['/test/missing'],
      },
    });

    const bindsIndex = bwrapArgs.indexOf('--seccomp');
    const binds = bwrapArgs.slice(bwrapArgs.indexOf('--bind'), bindsIndex);

    expect(binds).not.toContain('/test/missing');
  });

  it('throws an error if stat fails with a non-ENOENT error', async () => {
    vi.spyOn(fs, 'stat').mockImplementation(() => {
      const error = new Error('Permission denied');
      Object.assign(error, { code: 'EACCES' });
      return Promise.reject(error);
    });

    const req: SandboxRequest = {
      command: 'node',
      args: ['script.js'],
      cwd: workspace,
      env: {},
      policy: {
        forbiddenPaths: ['/test/forbidden1'],
      },
    };

    await expect(manager.prepareCommand(req)).rejects.toThrow(
      'Failed to deny access to forbidden path',
    );
  });

  it('prioritizes forbiddenPaths over allowedPaths by mounting them later in the bwrap arguments', async () => {
    vi.spyOn(fs, 'stat').mockImplementation(() =>
      Promise.resolve({ isDirectory: () => true } as Stats),
    );

    const conflictPath = '/test/conflict_path';
    const bwrapArgs = await getBwrapArgs({
      command: 'node',
      args: ['script.js'],
      cwd: workspace,
      env: {},
      policy: {
        allowedPaths: [conflictPath],
        forbiddenPaths: [conflictPath],
      },
    });

    const bindsIndex = bwrapArgs.indexOf('--seccomp');
    const binds = bwrapArgs.slice(bwrapArgs.indexOf('--bind'), bindsIndex);

    // Verify both are present
    expect(binds).toContain('--bind-try');
    expect(binds).toContain('--tmpfs');

    // The tmpfs mount MUST appear after the bind-try mount to override it
    const bindIndex = binds.indexOf('--bind-try');
    const tmpfsIndex = binds.indexOf('--tmpfs');
    expect(tmpfsIndex).toBeGreaterThan(bindIndex);
  });
});
