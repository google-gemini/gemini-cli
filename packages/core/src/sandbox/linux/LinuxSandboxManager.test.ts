/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LinuxSandboxManager } from './LinuxSandboxManager.js';
import {
  isKnownSafeCommand as isPosixSafeCommand,
  isDangerousCommand as isPosixDangerousCommand,
} from '../utils/commandSafety.js';
import { parsePosixSandboxDenials } from '../utils/sandboxDenialUtils.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';

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

vi.mock('../utils/commandSafety.js', () => ({
  isKnownSafeCommand: vi.fn(),
  isDangerousCommand: vi.fn(),
}));

vi.mock('../utils/sandboxDenialUtils.js', () => ({
  parsePosixSandboxDenials: vi.fn(),
  createSandboxDenialCache: vi.fn().mockReturnValue({}),
}));

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

  describe('isKnownSafeCommand', () => {
    it('should return true if the tool is in the approvedTools list', () => {
      const managerWithTools = new LinuxSandboxManager({
        workspace,
        modeConfig: { approvedTools: ['git'] },
      });
      expect(managerWithTools.isKnownSafeCommand(['git'])).toBe(true);
      expect(isPosixSafeCommand).not.toHaveBeenCalled();
    });

    it('should fallback to isPosixSafeCommand for non-approved tools', () => {
      vi.mocked(isPosixSafeCommand).mockReturnValue(true);
      expect(manager.isKnownSafeCommand(['ls'])).toBe(true);
      expect(isPosixSafeCommand).toHaveBeenCalledWith(['ls']);
    });
  });

  describe('isDangerousCommand', () => {
    it('should delegate to isPosixDangerousCommand', () => {
      vi.mocked(isPosixDangerousCommand).mockReturnValue(true);
      expect(manager.isDangerousCommand(['rm', '-rf', '/'])).toBe(true);
      expect(isPosixDangerousCommand).toHaveBeenCalledWith(['rm', '-rf', '/']);
    });
  });

  describe('parseDenials', () => {
    it('should delegate to parsePosixSandboxDenials', () => {
      const mockResult = {
        exitCode: 1,
        output: 'denied',
      } as unknown as ShellExecutionResult;
      const mockParsed = { filePaths: ['/tmp/blocked'] };
      vi.mocked(parsePosixSandboxDenials).mockReturnValue(mockParsed);

      expect(manager.parseDenials(mockResult)).toBe(mockParsed);
      expect(parsePosixSandboxDenials).toHaveBeenCalledWith(
        mockResult,
        manager['denialCache'],
      );
    });
  });

  describe('prepareCommand', () => {
    it('wraps the command and arguments correctly using a temporary file', async () => {
      const result = await manager.prepareCommand({
        command: 'ls',
        args: ['-la'],
        cwd: workspace,
        env: { PATH: '/usr/bin' },
      });

      expect(result.program).toBe('sh');
      expect(result.args[0]).toBe('-c');
      expect(result.args[1]).toContain(
        'exec bwrap --args 8 "$@" 8< "$args_path" 9< "$bpf_path"',
      );
      expect(result.args[result.args.length - 3]).toBe('--');
      expect(result.args[result.args.length - 2]).toBe('ls');
      expect(result.args[result.args.length - 1]).toBe('-la');
      expect(result.env['PATH']).toBe('/usr/bin');
    });

    it('cleans up the temporary arguments file', async () => {
      const result = await manager.prepareCommand({
        command: 'ls',
        args: [],
        cwd: workspace,
        env: {},
      });

      expect(result.cleanup).toBeDefined();
      result.cleanup!();

      expect(fs.unlinkSync).toHaveBeenCalled();
      const unlinkCall = vi.mocked(fs.unlinkSync).mock.calls[0];
      expect(unlinkCall[0]).toMatch(/gemini-cli-bwrap-args-.*\.args$/);
    });

    it('translates virtual commands', async () => {
      const readResult = await manager.prepareCommand({
        command: '__read',
        args: [path.join(workspace, 'file.txt')],
        cwd: workspace,
        env: {},
      });
      // Length is 8: ['-c', '...', '_', bpf, args, '--', '/bin/cat', file]
      expect(readResult.args[readResult.args.length - 2]).toBe('/bin/cat');

      const writeResult = await manager.prepareCommand({
        command: '__write',
        args: [path.join(workspace, 'file.txt')],
        cwd: workspace,
        env: {},
      });
      // Length is 11: ['-c', '...', '_', bpf, args, '--', '/bin/sh', '-c', '...', '_', file]
      expect(writeResult.args[writeResult.args.length - 5]).toBe('/bin/sh');
      expect(writeResult.args[writeResult.args.length - 1]).toBe(
        path.join(workspace, 'file.txt'),
      );
    });

    it('allows virtual commands targeting includeDirectories', async () => {
      const includeDir = '/opt/tools';
      const testFile = path.join(includeDir, 'tool.sh');
      const customManager = new LinuxSandboxManager({
        workspace,
        includeDirectories: [includeDir],
      });

      const result = await customManager.prepareCommand({
        command: '__read',
        args: [testFile],
        cwd: workspace,
        env: {},
      });

      expect(result.args[result.args.length - 2]).toBe('/bin/cat');
      expect(result.args[result.args.length - 1]).toBe(testFile);
    });
  });
});
