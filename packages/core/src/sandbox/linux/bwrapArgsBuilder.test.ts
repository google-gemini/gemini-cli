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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultOptions: BwrapArgsOptions = {
    workspace,
    workspaceWrite: false,
    networkAccess: false,
    allowedPaths: [],
    forbiddenPaths: [],
    additionalPermissions: {},
    includeDirectories: [],
    maskFilePath: '/tmp/mask',
    isWriteCommand: false,
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
      `${workspace}/.gitignore`,
      `${workspace}/.gitignore`,
      '--ro-bind',
      `${workspace}/.geminiignore`,
      `${workspace}/.geminiignore`,
      '--ro-bind',
      `${workspace}/.git`,
      `${workspace}/.git`,
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
      additionalPermissions: {
        fileSystem: { write: ['/home/user/workspace/out/dir'] },
      },
    });

    const index = args.indexOf('--bind-try');
    expect(index).not.toBe(-1);
    expect(args[index + 1]).toBe('/home/user/workspace/out/dir');
  });

  it('should protect both the symlink and the real path of governance files', async () => {
    vi.mocked(fs.realpathSync).mockImplementation((p) => {
      if (p.toString() === `${workspace}/.gitignore`)
        return '/shared/global.gitignore';
      return p.toString();
    });

    const args = await buildBwrapArgs(defaultOptions);

    expect(args).toContain('--ro-bind');
    expect(args).toContain(`${workspace}/.gitignore`);
    expect(args).toContain('/shared/global.gitignore');
  });

  it('should parameterize allowed paths and normalize them', async () => {
    const args = await buildBwrapArgs({
      ...defaultOptions,
      allowedPaths: ['/tmp/cache', '/opt/tools', workspace],
    });

    expect(args).toContain('--bind-try');
    expect(args[args.indexOf('/tmp/cache') - 1]).toBe('--bind-try');
    expect(args[args.indexOf('/opt/tools') - 1]).toBe('--bind-try');
  });

  it('should bind the parent directory of a non-existent path', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === '/home/user/workspace/new-file.txt') return false;
      return true;
    });

    const args = await buildBwrapArgs({
      ...defaultOptions,
      allowedPaths: ['/home/user/workspace/new-file.txt'],
      isWriteCommand: true,
    });

    const parentDir = '/home/user/workspace';
    const bindIndex = args.lastIndexOf(parentDir);
    expect(bindIndex).not.toBe(-1);
    expect(args[bindIndex - 2]).toBe('--bind-try');
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
      forbiddenPaths: ['/tmp/cache', '/opt/secret.txt'],
    });

    const cacheIndex = args.indexOf('/tmp/cache');
    expect(args[cacheIndex - 1]).toBe('--tmpfs');

    const secretIndex = args.indexOf('/opt/secret.txt');
    expect(args[secretIndex - 2]).toBe('--ro-bind');
    expect(args[secretIndex - 1]).toBe('/dev/null');
  });

  it('resolves forbidden symlink paths to their real paths', async () => {
    vi.mocked(fs.statSync).mockImplementation(
      () => ({ isDirectory: () => false }) as fs.Stats,
    );
    vi.mocked(fs.realpathSync).mockImplementation((p) => {
      if (p === '/tmp/forbidden-symlink') return '/opt/real-target.txt';
      return p.toString();
    });

    const args = await buildBwrapArgs({
      ...defaultOptions,
      forbiddenPaths: ['/tmp/forbidden-symlink'],
    });

    const secretIndex = args.indexOf('/opt/real-target.txt');
    expect(args[secretIndex - 2]).toBe('--ro-bind');
    expect(args[secretIndex - 1]).toBe('/dev/null');
  });

  it('masks directory symlinks with tmpfs for both paths', async () => {
    vi.mocked(fs.statSync).mockImplementation(
      () => ({ isDirectory: () => true }) as fs.Stats,
    );
    vi.mocked(fs.realpathSync).mockImplementation((p) => {
      if (p === '/tmp/dir-link') return '/opt/real-dir';
      return p.toString();
    });

    const args = await buildBwrapArgs({
      ...defaultOptions,
      forbiddenPaths: ['/tmp/dir-link'],
    });

    const idx = args.indexOf('/opt/real-dir');
    expect(args[idx - 1]).toBe('--tmpfs');
  });

  it('should override allowed paths if a path is also in forbidden paths', async () => {
    vi.mocked(fs.statSync).mockImplementation(
      () => ({ isDirectory: () => true }) as fs.Stats,
    );

    const args = await buildBwrapArgs({
      ...defaultOptions,
      forbiddenPaths: ['/tmp/conflict'],
      allowedPaths: ['/tmp/conflict'],
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
});
