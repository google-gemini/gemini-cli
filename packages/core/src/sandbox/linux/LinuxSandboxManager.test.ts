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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());
  });

  it('correctly outputs bwrap as the program with appropriate isolation flags', async () => {
    const manager = new LinuxSandboxManager({ workspace });
    const req: SandboxRequest = {
      command: 'ls',
      args: ['-la'],
      cwd: workspace,
      env: {},
    };

    const result = await manager.prepareCommand(req);

    expect(result.program).toBe('sh');
    expect(result.args[0]).toBe('-c');
    expect(result.args[1]).toBe(
      'bpf_path="$1"; shift; exec bwrap "$@" 9< "$bpf_path"',
    );
    expect(result.args[2]).toBe('_');
    expect(result.args[3]).toMatch(/gemini-cli-seccomp-.*\.bpf$/);

    const bwrapArgs = result.args.slice(4);
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

    const bwrapArgs = result.args.slice(4);
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
      '--bind',
      '/tmp/cache',
      '/tmp/cache',
      '--bind',
      '/opt/tools',
      '/opt/tools',
      '--seccomp',
      '9',
      '--',
      'node',
      'script.js',
    ]);
  });

  it('protects real paths of governance files if they are symlinks', async () => {
    vi.mocked(fs.realpathSync).mockImplementation((p) => {
      if (p.toString() === `${workspace}/.gitignore`)
        return '/shared/global.gitignore';
      return p.toString();
    });

    const manager = new LinuxSandboxManager({ workspace });
    const req: SandboxRequest = {
      command: 'ls',
      args: [],
      cwd: workspace,
      env: {},
    };

    const result = await manager.prepareCommand(req);
    const bwrapArgs = result.args.slice(4);

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

    const manager = new LinuxSandboxManager({ workspace });
    const req: SandboxRequest = {
      command: 'ls',
      args: [],
      cwd: workspace,
      env: {},
    };

    await manager.prepareCommand(req);

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.openSync).toHaveBeenCalled();
  });
});
