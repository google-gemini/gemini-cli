/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildBwrapArgs, type BwrapArgsOptions } from './bwrapArgsBuilder.js';
import fs from 'node:fs';
import * as shellUtils from '../../utils/shell-utils.js';
import os from 'node:os';
import { type ResolvedSandboxPaths } from '../../services/sandboxManager.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    default: {
      // @ts-expect-error - Property 'default' does not exist on type 'typeof import("node:fs")'
      ...actual.default,
      existsSync: vi.fn(() => true),
      realpathSync: vi.fn((p) => p.toString()),
      statSync: vi.fn(() => ({ isDirectory: () => true }) as fs.Stats),
      mkdirSync: vi.fn(),
      mkdtempSync: vi.fn((prefix: string) => prefix + 'mocked'),
      openSync: vi.fn(),
      closeSync: vi.fn(),
      writeFileSync: vi.fn(),
      readdirSync: vi.fn(() => []),
      chmodSync: vi.fn(),
      unlinkSync: vi.fn(),
      rmSync: vi.fn(),
    },
    existsSync: vi.fn(() => true),
    realpathSync: vi.fn((p) => p.toString()),
    statSync: vi.fn(() => ({ isDirectory: () => true }) as fs.Stats),
    mkdirSync: vi.fn(),
    mkdtempSync: vi.fn((prefix: string) => prefix + 'mocked'),
    openSync: vi.fn(),
    closeSync: vi.fn(),
    writeFileSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    chmodSync: vi.fn(),
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock('../../utils/shell-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../utils/shell-utils.js')>();
  return {
    ...actual,
    spawnAsync: vi.fn(() =>
      Promise.resolve({ status: 0, stdout: Buffer.from('') }),
    ),
    initializeShellParsers: vi.fn(),
    isStrictlyApproved: vi.fn().mockResolvedValue(true),
  };
});

describe.skipIf(os.platform() === 'win32')('buildBwrapArgs', () => {
  const workspace = '/home/user/workspace';

  const createResolvedPaths = (
    overrides: Partial<ResolvedSandboxPaths> = {},
  ): ResolvedSandboxPaths => ({
    workspace: {
      original: workspace,
      resolved: workspace,
    },
    forbidden: [],
    globalIncludes: [],
    policyAllowed: [],
    policyRead: [],
    policyWrite: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultOptions: BwrapArgsOptions = {
    resolvedPaths: createResolvedPaths(),
    workspaceWrite: false,
    networkAccess: false,
    maskFilePath: '/tmp/mask',
    isReadOnlyCommand: false,
  };

  it('should correctly format the base arguments', async () => {
    const args = await buildBwrapArgs(defaultOptions);

    expect(args).toEqual([
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
      '--ro-bind-try',
      workspace,
      workspace,
      '--ro-bind',
      `${workspace}/.git`,
      `${workspace}/.git`,
      '--ro-bind',
      `${workspace}/.gitignore`,
      `${workspace}/.gitignore`,
      '--ro-bind',
      `${workspace}/.geminiignore`,
      `${workspace}/.geminiignore`,
    ]);
  });

  it('binds workspace read-write when workspaceWrite is true', async () => {
    const args = await buildBwrapArgs({
      ...defaultOptions,
      workspaceWrite: true,
    });

    expect(args).toContain('--bind-try');
    const bindIndex = args.indexOf('--bind-try');
    expect(args[bindIndex + 1]).toBe(workspace);
  });

  it('maps network permissions to --share-net', async () => {
    const args = await buildBwrapArgs({
      ...defaultOptions,
      networkAccess: true,
    });

    expect(args).toContain('--share-net');
  });

  it('maps explicit write permissions to --bind-try', async () => {
    const args = await buildBwrapArgs({
      ...defaultOptions,
      resolvedPaths: createResolvedPaths({
        policyWrite: ['/home/user/workspace/out/dir'],
      }),
    });

    const index = args.indexOf('--bind-try');
    expect(index).not.toBe(-1);
    expect(args[index + 1]).toBe('/home/user/workspace/out/dir');
  });

  it('should protect both the symlink and the real path of governance files', async () => {
    const args = await buildBwrapArgs({
      ...defaultOptions,
      resolvedPaths: createResolvedPaths({
        workspace: {
          original: workspace,
          resolved: '/shared/global-workspace',
        },
      }),
    });

    expect(args).toContain('--ro-bind');
    expect(args).toContain(`${workspace}/.gitignore`);
    expect(args).toContain('/shared/global-workspace/.gitignore');
  });

  it('should parameterize allowed paths', async () => {
    const args = await buildBwrapArgs({
      ...defaultOptions,
      resolvedPaths: createResolvedPaths({
        policyAllowed: ['/tmp/cache', '/opt/tools'],
      }),
    });

    expect(args).toContain('--bind-try');
    expect(args[args.indexOf('/tmp/cache') - 1]).toBe('--bind-try');
    expect(args[args.indexOf('/opt/tools') - 1]).toBe('--bind-try');
  });

  it('should bind the parent directory of a non-existent path with --bind-try when isReadOnlyCommand is false', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === '/home/user/workspace/new-file.txt') return false;
      return true;
    });

    const args = await buildBwrapArgs({
      ...defaultOptions,
      isReadOnlyCommand: false,
      resolvedPaths: createResolvedPaths({
        policyAllowed: ['/home/user/workspace/new-file.txt'],
      }),
    });

    const parentDir = '/home/user/workspace';
    const bindIndex = args.lastIndexOf(parentDir);
    expect(bindIndex).not.toBe(-1);
    expect(args[bindIndex - 2]).toBe('--bind-try');
  });

  it('should bind the parent directory of a non-existent path with --ro-bind-try when isReadOnlyCommand is true', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === '/home/user/workspace/new-file.txt') return false;
      return true;
    });

    const args = await buildBwrapArgs({
      ...defaultOptions,
      isReadOnlyCommand: true,
      resolvedPaths: createResolvedPaths({
        policyAllowed: ['/home/user/workspace/new-file.txt'],
      }),
    });

    const parentDir = '/home/user/workspace';
    const bindIndex = args.lastIndexOf(parentDir);
    expect(bindIndex).not.toBe(-1);
    expect(args[bindIndex - 2]).toBe('--ro-bind-try');
  });

  it('should parameterize forbidden paths and explicitly deny them', async () => {
    vi.mocked(fs.statSync).mockImplementation((p) => {
      if (p.toString().includes('cache')) {
        return { isDirectory: () => true } as fs.Stats;
      }
      return { isDirectory: () => false } as fs.Stats;
    });

    const args = await buildBwrapArgs({
      ...defaultOptions,
      resolvedPaths: createResolvedPaths({
        forbidden: ['/tmp/cache', '/opt/secret.txt'],
      }),
    });

    const cacheIndex = args.indexOf('/tmp/cache');
    expect(args[cacheIndex - 1]).toBe('--tmpfs');

    const secretIndex = args.indexOf('/opt/secret.txt');
    expect(args[secretIndex - 2]).toBe('--ro-bind');
    expect(args[secretIndex - 1]).toBe('/dev/null');
  });

  it('handles resolved forbidden paths', async () => {
    vi.mocked(fs.statSync).mockImplementation(
      () => ({ isDirectory: () => false }) as fs.Stats,
    );

    const args = await buildBwrapArgs({
      ...defaultOptions,
      resolvedPaths: createResolvedPaths({
        forbidden: ['/opt/real-target.txt'],
      }),
    });

    const secretIndex = args.indexOf('/opt/real-target.txt');
    expect(args[secretIndex - 2]).toBe('--ro-bind');
    expect(args[secretIndex - 1]).toBe('/dev/null');
  });

  it('masks directory paths with tmpfs', async () => {
    vi.mocked(fs.statSync).mockImplementation(
      () => ({ isDirectory: () => true }) as fs.Stats,
    );

    const args = await buildBwrapArgs({
      ...defaultOptions,
      resolvedPaths: createResolvedPaths({
        forbidden: ['/opt/real-dir'],
      }),
    });

    const idx = args.indexOf('/opt/real-dir');
    expect(args[idx - 1]).toBe('--tmpfs');
  });

  it('should apply forbidden paths after allowed paths', async () => {
    vi.mocked(fs.statSync).mockImplementation(
      () => ({ isDirectory: () => true }) as fs.Stats,
    );

    const args = await buildBwrapArgs({
      ...defaultOptions,
      resolvedPaths: createResolvedPaths({
        policyAllowed: ['/tmp/conflict'],
        forbidden: ['/tmp/conflict'],
      }),
    });

    const bindIndex = args.findIndex(
      (a, i) => a === '--bind-try' && args[i + 1] === '/tmp/conflict',
    );
    const tmpfsIndex = args.findIndex(
      (a, i) => a === '--tmpfs' && args[i + 1] === '/tmp/conflict',
    );

    expect(bindIndex).toBeGreaterThan(-1);
    expect(tmpfsIndex).toBeGreaterThan(bindIndex);
    expect(args[tmpfsIndex + 1]).toBe('/tmp/conflict');
  });

  it('blocks .env and .env.* files', async () => {
    vi.mocked(shellUtils.spawnAsync).mockImplementation((cmd, args) => {
      if (cmd === 'find' && args?.[0] === workspace) {
        return Promise.resolve({
          status: 0,
          stdout: Buffer.from(`${workspace}/.env\0${workspace}/.env.local\0`),
        } as unknown as ReturnType<typeof shellUtils.spawnAsync>);
      }
      return Promise.resolve({
        status: 0,
        stdout: Buffer.from(''),
      } as unknown as ReturnType<typeof shellUtils.spawnAsync>);
    });

    const args = await buildBwrapArgs(defaultOptions);

    expect(args).toContain(`${workspace}/.env`);
    expect(args).toContain(`${workspace}/.env.local`);

    const envIndex = args.indexOf(`${workspace}/.env`);
    expect(args[envIndex - 2]).toBe('--bind');
    expect(args[envIndex - 1]).toBe('/tmp/mask');
  });

  it('scans globalIncludes for secret files', async () => {
    const includeDir = '/opt/tools';
    vi.mocked(shellUtils.spawnAsync).mockImplementation((cmd, args) => {
      if (cmd === 'find' && args?.[0] === includeDir) {
        return Promise.resolve({
          status: 0,
          stdout: Buffer.from(`${includeDir}/.env\0`),
        } as unknown as ReturnType<typeof shellUtils.spawnAsync>);
      }
      return Promise.resolve({
        status: 0,
        stdout: Buffer.from(''),
      } as unknown as ReturnType<typeof shellUtils.spawnAsync>);
    });

    const args = await buildBwrapArgs({
      ...defaultOptions,
      resolvedPaths: createResolvedPaths({
        globalIncludes: [includeDir],
      }),
    });

    expect(args).toContain(`${includeDir}/.env`);
    const envIndex = args.indexOf(`${includeDir}/.env`);
    expect(args[envIndex - 2]).toBe('--bind');
  });

  it('binds git worktree directories if present', async () => {
    const worktreeGitDir = '/path/to/worktree/.git';
    const mainGitDir = '/path/to/main/.git';

    const args = await buildBwrapArgs({
      ...defaultOptions,
      resolvedPaths: createResolvedPaths({
        gitWorktree: {
          worktreeGitDir,
          mainGitDir,
        },
      }),
    });

    expect(args).toContain(worktreeGitDir);
    expect(args).toContain(mainGitDir);
    expect(args[args.indexOf(worktreeGitDir) - 1]).toBe('--ro-bind-try');
    expect(args[args.indexOf(mainGitDir) - 1]).toBe('--ro-bind-try');
  });

  it('enforces read-only binding for git worktrees even if workspaceWrite is true', async () => {
    const worktreeGitDir = '/path/to/worktree/.git';

    const args = await buildBwrapArgs({
      ...defaultOptions,
      workspaceWrite: true,
      resolvedPaths: createResolvedPaths({
        gitWorktree: {
          worktreeGitDir,
        },
      }),
    });

    expect(args[args.indexOf(worktreeGitDir) - 1]).toBe('--ro-bind-try');
  });

  it('git worktree read-only bindings should override previous policyWrite bindings', async () => {
    const worktreeGitDir = '/custom/worktree/.git';

    const args = await buildBwrapArgs({
      ...defaultOptions,
      resolvedPaths: createResolvedPaths({
        policyWrite: ['/custom/worktree'],
        gitWorktree: {
          worktreeGitDir,
        },
      }),
    });

    const writeBindIndex = args.indexOf('/custom/worktree');
    const worktreeBindIndex = args.lastIndexOf(worktreeGitDir);

    expect(writeBindIndex).toBeGreaterThan(-1);
    expect(worktreeBindIndex).toBeGreaterThan(-1);
    expect(worktreeBindIndex).toBeGreaterThan(writeBindIndex);
  });
});
