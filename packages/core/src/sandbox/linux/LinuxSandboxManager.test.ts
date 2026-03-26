/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      realpathSync: vi.fn((p) => p.toString()),
      statSync: vi.fn(() => ({ isDirectory: () => true }) as fs.Stats),
      mkdirSync: vi.fn(),
      openSync: vi.fn(),
      closeSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
    existsSync: vi.fn(() => true),
    realpathSync: vi.fn((p) => p.toString()),
    statSync: vi.fn(() => ({ isDirectory: () => true }) as fs.Stats),
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

  const getBwrapArgs = async (
    req: SandboxRequest,
    customManager?: LinuxSandboxManager,
  ) => {
    const mgr = customManager || manager;
    const result = await mgr.prepareCommand(req);
    expect(result.program).toBe('sh');
    expect(result.args[0]).toBe('-c');
    expect(result.args[1]).toBe(
      'bpf_path="$1"; shift; exec bwrap "$@" 9< "$bpf_path"',
    );
    expect(result.args[2]).toBe('_');
    expect(result.args[3]).toMatch(/gemini-cli-seccomp-.*\.bpf$/);
    return result.args.slice(4);
  };

  describe('prepareCommand', () => {
    it('should correctly format the base command and args', async () => {
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
        '--seccomp',
        '9',
        '--',
        'ls',
        '-la',
      ]);
    });

    it('binds workspace read-write when readonly is false', async () => {
      const customManager = new LinuxSandboxManager({
        workspace,
        modeConfig: { readonly: false },
      });
      const bwrapArgs = await getBwrapArgs(
        {
          command: 'ls',
          args: [],
          cwd: workspace,
          env: {},
        },
        customManager,
      );

      expect(bwrapArgs).toContain('--bind-try');
      expect(bwrapArgs).toContain(workspace);
    });

    it('maps network permissions to --share-net', async () => {
      const bwrapArgs = await getBwrapArgs({
        command: 'curl',
        args: [],
        cwd: workspace,
        env: {},
        policy: { additionalPermissions: { network: true } },
      });

      expect(bwrapArgs).toContain('--share-net');
    });

    it('maps explicit write permissions to --bind-try', async () => {
      const bwrapArgs = await getBwrapArgs({
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

    it('rejects overrides in plan mode', async () => {
      const customManager = new LinuxSandboxManager({
        workspace,
        modeConfig: { allowOverrides: false },
      });
      await expect(
        customManager.prepareCommand({
          command: 'ls',
          args: [],
          cwd: workspace,
          env: {},
          policy: { additionalPermissions: { network: true } },
        }),
      ).rejects.toThrow(
        /Cannot override readonly\/network\/filesystem restrictions in Plan mode/,
      );
    });

    it('should correctly pass through the cwd to the resulting command', async () => {
      const req: SandboxRequest = {
        command: 'ls',
        args: [],
        cwd: '/different/cwd',
        env: {},
      };

      const result = await manager.prepareCommand(req);

      expect(result.cwd).toBe('/different/cwd');
    });

    it('should apply environment sanitization via the default mechanisms', async () => {
      const req: SandboxRequest = {
        command: 'test',
        args: [],
        cwd: workspace,
        env: {
          API_KEY: 'secret',
          PATH: '/usr/bin',
        },
        policy: {
          sanitizationConfig: {
            allowedEnvironmentVariables: ['PATH'],
            blockedEnvironmentVariables: ['API_KEY'],
            enableEnvironmentVariableRedaction: true,
          },
        },
      };

      const result = await manager.prepareCommand(req);
      expect(result.env['PATH']).toBe('/usr/bin');
      expect(result.env['API_KEY']).toBeUndefined();
    });

    it('should allow network when networkAccess is true', async () => {
      const bwrapArgs = await getBwrapArgs({
        command: 'ls',
        args: ['-la'],
        cwd: workspace,
        env: {},
        policy: {
          networkAccess: true,
        },
      });

      expect(bwrapArgs).toContain('--share-net');
    });

    describe('governance files', () => {
      it('should ensure governance files exist', async () => {
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

      it('should protect both the symlink and the real path if they differ', async () => {
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

        const realGitignoreIndex = bwrapArgs.indexOf(
          '/shared/global.gitignore',
        );
        expect(bwrapArgs[realGitignoreIndex - 1]).toBe('--ro-bind');
        expect(bwrapArgs[realGitignoreIndex + 1]).toBe(
          '/shared/global.gitignore',
        );
      });
    });

    describe('allowedPaths', () => {
      it('should parameterize allowed paths and normalize them', async () => {
        const bwrapArgs = await getBwrapArgs({
          command: 'node',
          args: ['script.js'],
          cwd: workspace,
          env: {},
          policy: {
            allowedPaths: ['/tmp/cache', '/opt/tools', workspace],
          },
        });

        expect(bwrapArgs).toContain('--bind-try');
        expect(bwrapArgs[bwrapArgs.indexOf('/tmp/cache') - 1]).toBe(
          '--bind-try',
        );
        expect(bwrapArgs[bwrapArgs.indexOf('/opt/tools') - 1]).toBe(
          '--bind-try',
        );
      });

      it('should not grant read-write access to allowedPaths inside the workspace when readonly mode is active', async () => {
        const manager = new LinuxSandboxManager({
          workspace,
          modeConfig: { readonly: true },
        });
        const result = await manager.prepareCommand({
          command: 'ls',
          args: [],
          cwd: workspace,
          env: {},
          policy: {
            allowedPaths: [workspace + '/subdirectory'],
          },
        });
        const bwrapArgs = result.args;
        const bindIndex = bwrapArgs.indexOf(workspace + '/subdirectory');
        expect(bwrapArgs[bindIndex - 1]).toBe('--ro-bind-try');
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

        const binds = bwrapArgs.filter((a) => a === workspace);
        expect(binds.length).toBe(2);
      });
    });

    describe('forbiddenPaths', () => {
      it('should parameterize forbidden paths and explicitly deny them', async () => {
        vi.mocked(fs.statSync).mockImplementation((p) => {
          if (p.toString().includes('cache')) {
            return { isDirectory: () => true } as fs.Stats;
          }
          return { isDirectory: () => false } as fs.Stats;
        });
        vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());

        const bwrapArgs = await getBwrapArgs({
          command: 'ls',
          args: ['-la'],
          cwd: workspace,
          env: {},
          policy: {
            forbiddenPaths: ['/tmp/cache', '/opt/secret.txt'],
          },
        });

        const cacheIndex = bwrapArgs.indexOf('/tmp/cache');
        expect(bwrapArgs[cacheIndex - 1]).toBe('--tmpfs');

        const secretIndex = bwrapArgs.indexOf('/opt/secret.txt');
        expect(bwrapArgs[secretIndex - 2]).toBe('--ro-bind');
        expect(bwrapArgs[secretIndex - 1]).toBe('/dev/null');
      });

      it('resolves forbidden symlink paths to their real paths', async () => {
        vi.mocked(fs.statSync).mockImplementation(
          () => ({ isDirectory: () => false }) as fs.Stats,
        );
        vi.mocked(fs.realpathSync).mockImplementation((p) => {
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

        const secretIndex = bwrapArgs.indexOf('/opt/real-target.txt');
        expect(bwrapArgs[secretIndex - 2]).toBe('--ro-bind');
        expect(bwrapArgs[secretIndex - 1]).toBe('/dev/null');
      });

      it('explicitly denies non-existent forbidden paths to prevent creation', async () => {
        const error = new Error('File not found') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        vi.mocked(fs.statSync).mockImplementation(() => {
          throw error;
        });
        vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());

        const bwrapArgs = await getBwrapArgs({
          command: 'ls',
          args: [],
          cwd: workspace,
          env: {},
          policy: {
            forbiddenPaths: ['/tmp/not-here.txt'],
          },
        });

        const idx = bwrapArgs.indexOf('/tmp/not-here.txt');
        expect(bwrapArgs[idx - 2]).toBe('--symlink');
        expect(bwrapArgs[idx - 1]).toBe('/dev/null');
      });

      it('masks directory symlinks with tmpfs for both paths', async () => {
        vi.mocked(fs.statSync).mockImplementation(
          () => ({ isDirectory: () => true }) as fs.Stats,
        );
        vi.mocked(fs.realpathSync).mockImplementation((p) => {
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

        const idx = bwrapArgs.indexOf('/opt/real-dir');
        expect(bwrapArgs[idx - 1]).toBe('--tmpfs');
      });

      it('should override allowed paths if a path is also in forbidden paths', async () => {
        vi.mocked(fs.statSync).mockImplementation(
          () => ({ isDirectory: () => true }) as fs.Stats,
        );
        vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());

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

        const bindTryIdx = bwrapArgs.indexOf('--bind-try');
        const tmpfsIdx = bwrapArgs.lastIndexOf('--tmpfs');

        expect(bwrapArgs[bindTryIdx + 1]).toBe('/tmp/conflict');
        expect(bwrapArgs[tmpfsIdx + 1]).toBe('/tmp/conflict');
        expect(tmpfsIdx).toBeGreaterThan(bindTryIdx);
      });
    });
  });
});
