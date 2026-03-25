/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinuxSandboxManager } from './LinuxSandboxManager.js';
import * as sandboxManager from '../../services/sandboxManager.js';
import type { SandboxRequest } from '../../services/sandboxManager.js';
import fs from 'node:fs';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      // @ts-expect-error - Property 'default' does not exist on type 'typeof import("node:fs")'
      ...actual.default,
      existsSync: vi.fn(() => true),
      realpathSync: vi.fn((p: string | Buffer) => p.toString()),
      mkdirSync: vi.fn(),
      openSync: vi.fn(),
      closeSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
    existsSync: vi.fn(() => true),
    realpathSync: vi.fn((p: string | Buffer) => p.toString()),
    mkdirSync: vi.fn(),
    openSync: vi.fn(),
    closeSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe('LinuxSandboxManager', () => {
  const workspace = '/home/user/workspace';
  let manager: LinuxSandboxManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());
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

  /**
   * Helper to verify only the dynamic, policy-based binds (e.g. allowedPaths, forbiddenPaths).
   * It asserts that the base workspace and governance files are present exactly once,
   * then strips them away, leaving only the dynamic binds for a focused, non-brittle assertion.
   */
  const expectDynamicBinds = (
    bwrapArgs: string[],
    expectedDynamicBinds: string[],
  ) => {
    const bindsIndex = bwrapArgs.indexOf('--seccomp');
    const allBinds = bwrapArgs.slice(bwrapArgs.indexOf('--bind'), bindsIndex);

    const baseBinds = [
      '--bind',
      workspace,
      workspace,
      '--ro-bind',
      `${workspace}/.gitignore`,
      `${workspace}/.gitignore`,
      '--ro-bind',
      `${workspace}/.geminiignore`,
      `${workspace}/.geminiignore`,
      '--ro-bind',
      `${workspace}/.git`,
      `${workspace}/.git`,
    ];

    // Verify the base binds are present exactly at the beginning
    expect(allBinds.slice(0, baseBinds.length)).toEqual(baseBinds);

    // Extract the remaining dynamic binds
    const dynamicBinds = allBinds.slice(baseBinds.length);
    expect(dynamicBinds).toEqual(expectedDynamicBinds);
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
      '--ro-bind',
      `${workspace}/.gitignore`,
      `${workspace}/.gitignore`,
      '--ro-bind',
      `${workspace}/.geminiignore`,
      `${workspace}/.geminiignore`,
      '--ro-bind',
      `${workspace}/.git`,
      `${workspace}/.git`,
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
    expectDynamicBinds(bwrapArgs, [
      '--bind-try',
      '/tmp/cache',
      '/tmp/cache',
      '--bind-try',
      '/opt/tools',
      '/opt/tools',
    ]);
  });

  it('protects real paths of governance files if they are symlinks', async () => {
    vi.mocked(fs.realpathSync).mockImplementation((p) => {
      if (p.toString() === `${workspace}/.gitignore`)
        return '/shared/global.gitignore';
      return p.toString();
    });

    const bwrapArgs = await getBwrapArgs({
      command: 'ls',
      args: [],
      cwd: workspace,
      env: {},
    });

    expect(bwrapArgs).toContain('--ro-bind');
    expect(bwrapArgs).toContain(`${workspace}/.gitignore`);
    expect(bwrapArgs).toContain('/shared/global.gitignore');

    // Check that both are bound
    const gitignoreIndex = bwrapArgs.indexOf(`${workspace}/.gitignore`);
    expect(bwrapArgs[gitignoreIndex - 1]).toBe('--ro-bind');
    expect(bwrapArgs[gitignoreIndex + 1]).toBe(`${workspace}/.gitignore`);

    const realGitignoreIndex = bwrapArgs.indexOf('/shared/global.gitignore');
    expect(bwrapArgs[realGitignoreIndex - 1]).toBe('--ro-bind');
    expect(bwrapArgs[realGitignoreIndex + 1]).toBe('/shared/global.gitignore');
  });

  it('touches governance files if they do not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await getBwrapArgs({
      command: 'ls',
      args: [],
      cwd: workspace,
      env: {},
    });

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.openSync).toHaveBeenCalled();
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

    // Should only contain the primary workspace bind and governance files, not the second workspace bind with a trailing slash
    expectDynamicBinds(bwrapArgs, []);
  });

  it('maps forbiddenPaths to empty mounts', async () => {
    vi.spyOn(fs.promises, 'stat').mockImplementation(async (p) => {
      // Mock /tmp/cache as a directory, and /opt/secret.txt as a file
      if (p.toString().includes('cache')) {
        return { isDirectory: () => true } as fs.Stats;
      }
      return { isDirectory: () => false } as fs.Stats;
    });
    vi.spyOn(sandboxManager, 'tryRealpath').mockImplementation(async (p) =>
      p.toString(),
    );

    const bwrapArgs = await getBwrapArgs({
      command: 'ls',
      args: ['-la'],
      cwd: workspace,
      env: {},
      policy: {
        forbiddenPaths: ['/tmp/cache', '/opt/secret.txt'],
      },
    });

    expectDynamicBinds(bwrapArgs, [
      '--tmpfs',
      '/tmp/cache',
      '--remount-ro',
      '/tmp/cache',
      '--ro-bind-try',
      '/dev/null',
      '/opt/secret.txt',
    ]);
  });

  it('overrides allowedPaths if a path is also in forbiddenPaths', async () => {
    vi.spyOn(fs.promises, 'stat').mockImplementation(
      async () => ({ isDirectory: () => true }) as fs.Stats,
    );
    vi.spyOn(sandboxManager, 'tryRealpath').mockImplementation(async (p) =>
      p.toString(),
    );

    const bwrapArgs = await getBwrapArgs({
      command: 'ls',
      args: ['-la'],
      cwd: workspace,
      env: {},
      policy: {
        allowedPaths: ['/tmp/conflict'],
        forbiddenPaths: ['/tmp/conflict'],
      },
    });

    expectDynamicBinds(bwrapArgs, [
      '--bind-try',
      '/tmp/conflict',
      '/tmp/conflict',
      '--tmpfs',
      '/tmp/conflict',
      '--remount-ro',
      '/tmp/conflict',
    ]);
  });

  it('protects both the resolved path and the original path for forbidden symlinks', async () => {
    vi.spyOn(fs.promises, 'stat').mockImplementation(
      async () => ({ isDirectory: () => false }) as fs.Stats,
    );
    vi.spyOn(sandboxManager, 'tryRealpath').mockImplementation(async (p) => {
      if (p === '/tmp/forbidden-symlink') return '/opt/real-target.txt';
      return p.toString();
    });

    const bwrapArgs = await getBwrapArgs({
      command: 'ls',
      args: ['-la'],
      cwd: workspace,
      env: {},
      policy: {
        forbiddenPaths: ['/tmp/forbidden-symlink'],
      },
    });

    // Should explicitly mask both the resolved path and the original symlink path
    expectDynamicBinds(bwrapArgs, [
      '--ro-bind-try',
      '/dev/null',
      '/opt/real-target.txt',
      '--ro-bind-try',
      '/dev/null',
      '/tmp/forbidden-symlink',
    ]);
  });

  it('masks non-existent forbidden paths with a broken symlink', async () => {
    const error = new Error('File not found') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    vi.spyOn(fs.promises, 'stat').mockRejectedValue(error);
    vi.spyOn(sandboxManager, 'tryRealpath').mockImplementation(async (p) =>
      p.toString(),
    );

    const bwrapArgs = await getBwrapArgs({
      command: 'ls',
      args: [],
      cwd: workspace,
      env: {},
      policy: {
        forbiddenPaths: ['/tmp/not-here.txt'],
      },
    });

    expectDynamicBinds(bwrapArgs, [
      '--symlink',
      '/.forbidden',
      '/tmp/not-here.txt',
    ]);
  });

  it('masks directory symlinks with tmpfs for both paths', async () => {
    vi.spyOn(fs.promises, 'stat').mockImplementation(
      async () => ({ isDirectory: () => true }) as fs.Stats,
    );
    vi.spyOn(sandboxManager, 'tryRealpath').mockImplementation(async (p) => {
      if (p === '/tmp/dir-link') return '/opt/real-dir';
      return p.toString();
    });

    const bwrapArgs = await getBwrapArgs({
      command: 'ls',
      args: [],
      cwd: workspace,
      env: {},
      policy: {
        forbiddenPaths: ['/tmp/dir-link'],
      },
    });

    expectDynamicBinds(bwrapArgs, [
      '--tmpfs',
      '/opt/real-dir',
      '--remount-ro',
      '/opt/real-dir',
      '--tmpfs',
      '/tmp/dir-link',
      '--remount-ro',
      '/tmp/dir-link',
    ]);
  });
});
