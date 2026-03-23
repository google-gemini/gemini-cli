/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  afterEach(() => {
    vi.restoreAllMocks();
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
      '--unshare-all',
      '--seccomp',
      '9',
      '--',
      'ls',
      '-la',
    ]);
  });

  it('configures network access when requested', async () => {
    const bwrapArgs = await getBwrapArgs({
      command: 'curl',
      args: ['http://example.com'],
      cwd: workspace,
      env: {},
      policy: { networkAccess: true },
    });

    expect(bwrapArgs).toContain('--unshare-user');
    expect(bwrapArgs).toContain('--unshare-ipc');
    expect(bwrapArgs).toContain('--unshare-pid');
    expect(bwrapArgs).toContain('--unshare-uts');
    expect(bwrapArgs).toContain('--unshare-cgroup');
    expect(bwrapArgs).not.toContain('--unshare-all');
    expect(bwrapArgs).not.toContain('--unshare-net');
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
    const seccompIndex = bwrapArgs.indexOf('--seccomp');
    const binds = bwrapArgs.slice(0, seccompIndex);

    expect(binds).toEqual(
      expect.arrayContaining([
        '--bind',
        workspace,
        workspace,
        '--bind-try',
        '/tmp/cache',
        '/tmp/cache',
        '--bind-try',
        '/opt/tools',
        '/opt/tools',
      ]),
    );
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

    const seccompIndex = bwrapArgs.indexOf('--seccomp');
    const binds = bwrapArgs.slice(0, seccompIndex);

    // Should only contain the primary workspace bind, not the second one with a trailing slash
    expect(binds.filter((x) => x === workspace)).toHaveLength(2); // One for src, one for dest in --bind
    expect(binds).not.toContain('--bind-try');
  });

  it('maps forbidden directory paths to bwrap tmpfs with remount-ro', async () => {
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

    expect(bwrapArgs).toEqual(
      expect.arrayContaining([
        '--tmpfs',
        '/test/forbidden_dir',
        '--remount-ro',
        '/test/forbidden_dir',
      ]),
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

    const seccompIndex = bwrapArgs.indexOf('--seccomp');
    const binds = bwrapArgs.slice(0, seccompIndex);

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

    const seccompIndex = bwrapArgs.indexOf('--seccomp');
    const binds = bwrapArgs.slice(0, seccompIndex);

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

    // The forbiddenPath (tmpfs) MUST appear after the allowedPath (bind-try) to override it
    // We use lastIndexOf for tmpfs because getBaseBwrapArgs already adds a --tmpfs for /tmp
    const bindIndex = bwrapArgs.indexOf('--bind-try');
    const tmpfsIndex = bwrapArgs.lastIndexOf('--tmpfs');
    expect(bindIndex).toBeGreaterThan(-1);
    expect(tmpfsIndex).toBeGreaterThan(-1);
    expect(tmpfsIndex).toBeGreaterThan(bindIndex);
  });

  it('masks symlinks and their targets for forbiddenPaths', async () => {
    vi.spyOn(fs, 'realpath').mockImplementation(async (p: unknown) => {
      if (p === '/test/symlink') return '/test/real_path';
      return String(p);
    });

    vi.spyOn(fs, 'stat').mockImplementation(async (p: unknown) => {
      if (p === '/test/real_path') {
        return { isDirectory: () => false } as Stats;
      }
      throw { code: 'ENOENT' };
    });

    const bwrapArgs = await getBwrapArgs({
      command: 'echo',
      args: [],
      cwd: workspace,
      env: {},
      policy: {
        forbiddenPaths: ['/test/symlink'],
      },
    });

    const seccompIndex = bwrapArgs.indexOf('--seccomp');
    const binds = bwrapArgs.slice(0, seccompIndex);

    // Verify both the symlink and the target are masked
    expect(binds).toContain('/test/symlink');
    expect(binds).toContain('/test/real_path');

    // Specifically verify they are both bound as ro-bind-try to /dev/null
    expect(
      binds.findIndex(
        (val, i) =>
          val === '--ro-bind-try' &&
          binds[i + 1] === '/dev/null' &&
          binds[i + 2] === '/test/symlink',
      ),
    ).not.toBe(-1);
    expect(
      binds.findIndex(
        (val, i) =>
          val === '--ro-bind-try' &&
          binds[i + 1] === '/dev/null' &&
          binds[i + 2] === '/test/real_path',
      ),
    ).not.toBe(-1);
  });
});
