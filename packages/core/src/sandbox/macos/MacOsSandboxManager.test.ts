/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MacOsSandboxManager } from './MacOsSandboxManager.js';
import * as seatbeltArgsBuilder from './seatbeltArgsBuilder.js';
import {
  isKnownSafeCommand as isPosixSafeCommand,
  isDangerousCommand as isPosixDangerousCommand,
} from '../utils/commandSafety.js';
import { parsePosixSandboxDenials } from '../utils/sandboxDenialUtils.js';
import type { ExecutionPolicy } from '../../services/sandboxManager.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';

vi.mock('../utils/commandSafety.js', () => ({
  isKnownSafeCommand: vi.fn(),
  isDangerousCommand: vi.fn(),
}));

vi.mock('../utils/sandboxDenialUtils.js', () => ({
  parsePosixSandboxDenials: vi.fn(),
  createSandboxDenialCache: vi.fn().mockReturnValue({}),
}));

describe('MacOsSandboxManager', () => {
  let mockWorkspace: string;
  let mockAllowedPaths: string[];
  const mockNetworkAccess = true;

  let mockPolicy: ExecutionPolicy;
  let manager: MacOsSandboxManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspace = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-macos-test-')),
    );

    const allowedPathTemp = path.join(
      os.tmpdir(),
      'gemini-cli-macos-test-allowed-' + Math.random().toString(36).slice(2),
    );
    if (!fs.existsSync(allowedPathTemp)) {
      fs.mkdirSync(allowedPathTemp);
    }
    mockAllowedPaths = [fs.realpathSync(allowedPathTemp)];

    mockPolicy = {
      allowedPaths: mockAllowedPaths,
      networkAccess: mockNetworkAccess,
    };

    manager = new MacOsSandboxManager({ workspace: mockWorkspace });

    // Mock the seatbelt args builder to isolate manager tests
    vi.spyOn(seatbeltArgsBuilder, 'buildSeatbeltProfile').mockReturnValue(
      '(mock profile)',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(mockWorkspace, { recursive: true, force: true });
    if (mockAllowedPaths && mockAllowedPaths[0]) {
      fs.rmSync(mockAllowedPaths[0], { recursive: true, force: true });
    }
  });

  describe('isKnownSafeCommand', () => {
    it('should return true if the tool is in the approvedTools list', () => {
      const managerWithTools = new MacOsSandboxManager({
        workspace: mockWorkspace,
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
    it('should correctly format the base command and args', async () => {
      const result = await manager.prepareCommand({
        command: 'echo',
        args: ['hello'],
        cwd: mockWorkspace,
        env: {},
        policy: mockPolicy,
      });

      expect(seatbeltArgsBuilder.buildSeatbeltProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          networkAccess: true,
          workspaceWrite: false,
        }),
      );

      expect(result.program).toBe('/usr/bin/sandbox-exec');
      expect(result.args[0]).toBe('-f');
      expect(result.args[1]).toMatch(/gemini-cli-seatbelt-.*\.sb$/);
      expect(result.args.slice(2)).toEqual(['--', 'echo', 'hello']);

      // Verify temp file was written
      const tempFile = result.args[1];
      expect(fs.existsSync(tempFile)).toBe(true);
      expect(fs.readFileSync(tempFile, 'utf8')).toBe('(mock profile)');

      // Verify cleanup callback deletes the file
      expect(result.cleanup).toBeDefined();
      result.cleanup!();
      expect(fs.existsSync(tempFile)).toBe(false);
    });

    it('should correctly pass through the cwd to the resulting command', async () => {
      const result = await manager.prepareCommand({
        command: 'echo',
        args: ['hello'],
        cwd: '/test/different/cwd',
        env: {},
        policy: mockPolicy,
      });

      expect(result.cwd).toBe('/test/different/cwd');
    });

    it('should allow network when networkAccess is true', async () => {
      await manager.prepareCommand({
        command: 'echo',
        args: ['hello'],
        cwd: mockWorkspace,
        env: {},
        policy: { ...mockPolicy, networkAccess: true },
      });

      expect(seatbeltArgsBuilder.buildSeatbeltProfile).toHaveBeenCalledWith(
        expect.objectContaining({ networkAccess: true }),
      );
    });

    describe('virtual commands', () => {
      it('should translate __read to /bin/cat', async () => {
        const testFile = path.join(mockWorkspace, 'file.txt');
        const result = await manager.prepareCommand({
          command: '__read',
          args: [testFile],
          cwd: mockWorkspace,
          env: {},
          policy: mockPolicy,
        });

        expect(result.args[result.args.length - 2]).toBe('/bin/cat');
        expect(result.args[result.args.length - 1]).toBe(testFile);
      });

      it('should translate __write to /bin/sh -c tee ...', async () => {
        const testFile = path.join(mockWorkspace, 'file.txt');
        const result = await manager.prepareCommand({
          command: '__write',
          args: [testFile],
          cwd: mockWorkspace,
          env: {},
          policy: mockPolicy,
        });

        expect(result.args[result.args.length - 5]).toBe('/bin/sh');
        expect(result.args[result.args.length - 4]).toBe('-c');
        expect(result.args[result.args.length - 3]).toBe(
          'tee -- "$@" > /dev/null',
        );
        expect(result.args[result.args.length - 2]).toBe('_');
        expect(result.args[result.args.length - 1]).toBe(testFile);
      });
    });
  });
});
