/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinuxSandboxManager } from './LinuxSandboxManager.js';
import type { SandboxRequest } from '../../services/sandboxManager.js';
import fs from 'node:fs';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    default: {
      ...(actual['default'] || {}),
      existsSync: vi.fn(() => true),
      realpathSync: vi.fn((p) => p.toString()),
      statSync: vi.fn(() => ({ isDirectory: () => true })),
      mkdirSync: vi.fn(),
      openSync: vi.fn(),
      closeSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
    existsSync: vi.fn(() => true),
    realpathSync: vi.fn((p) => p.toString()),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
    mkdirSync: vi.fn(),
    openSync: vi.fn(),
    closeSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe('LinuxSandboxManager', () => {
  const workspace = '/home/user/workspace';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());
  });

  const getBwrapArgs = async (
    manager: LinuxSandboxManager,
    req: SandboxRequest,
  ) => {
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

  it('correctly outputs bwrap as the program with appropriate isolation flags (readonly default)', async () => {
    const manager = new LinuxSandboxManager({ workspace });
    const bwrapArgs = await getBwrapArgs(manager, {
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
      '--ro-bind-try',
      workspace,
      workspace,
      // Governance files bind mounted read-only
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

  it('binds workspace read-write when readonly is false', async () => {
    const manager = new LinuxSandboxManager({
      workspace,
      modeConfig: { readonly: false },
    });
    const bwrapArgs = await getBwrapArgs(manager, {
      command: 'ls',
      args: [],
      cwd: workspace,
      env: {},
    });

    expect(bwrapArgs).toContain('--bind');
    expect(bwrapArgs).toContain(workspace);
  });

  it('maps network permissions to --share-net', async () => {
    const manager = new LinuxSandboxManager({ workspace });
    const bwrapArgs = await getBwrapArgs(manager, {
      command: 'curl',
      args: [],
      cwd: workspace,
      env: {},
      policy: { additionalPermissions: { network: true } },
    });

    expect(bwrapArgs).toContain('--share-net');
  });

  it('maps explicit write permissions to --bind-try', async () => {
    const manager = new LinuxSandboxManager({ workspace });
    const bwrapArgs = await getBwrapArgs(manager, {
      command: 'touch',
      args: [],
      cwd: workspace,
      env: {},
      policy: {
        additionalPermissions: {
          fileSystem: { write: ['/home/user/workspace/out/dir'] },
        },
      },
    });

    const index = bwrapArgs.indexOf('--bind-try');
    expect(index).not.toBe(-1);
    expect(bwrapArgs[index + 1]).toBe('/home/user/workspace/out/dir');
  });

  it('maps forbidden directories to --tmpfs and files to /dev/null', async () => {
    const manager = new LinuxSandboxManager({ workspace });
    vi.mocked(fs.statSync).mockImplementation(
      (p) =>
        ({ isDirectory: () => p === '/forbidden/dir' }) as unknown as fs.Stats,
    );

    const bwrapArgs = await getBwrapArgs(manager, {
      command: 'cat',
      args: [],
      cwd: workspace,
      env: {},
      policy: { forbiddenPaths: ['/forbidden/dir', '/forbidden/file.txt'] },
    });

    // bwrapArgs will have --tmpfs /tmp, we need to find the specific one
    const dirTmpfsIndex = bwrapArgs.indexOf('/forbidden/dir');
    expect(bwrapArgs[dirTmpfsIndex - 1]).toBe('--tmpfs');

    const fileDevNullIndex = bwrapArgs.indexOf('/forbidden/file.txt');
    expect(bwrapArgs[fileDevNullIndex - 2]).toBe('--ro-bind');
    expect(bwrapArgs[fileDevNullIndex - 1]).toBe('/dev/null');
  });

  it('rejects overrides in plan mode', async () => {
    const manager = new LinuxSandboxManager({
      workspace,
      modeConfig: { allowOverrides: false },
    });
    await expect(
      manager.prepareCommand({
        command: 'ls',
        args: [],
        cwd: workspace,
        env: {},
        policy: { additionalPermissions: { network: true } },
      }),
    ).rejects.toThrow(
      /Cannot override readonly\/network restrictions in Plan mode/,
    );
  });
});
