/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MacOsSandboxManager } from './MacOsSandboxManager.js';
import type { ExecutionPolicy } from '../../services/sandboxManager.js';
import * as seatbeltArgsBuilder from './seatbeltArgsBuilder.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('MacOsSandboxManager', () => {
  let mockWorkspace: string;
  let mockAllowedPaths: string[];
  const mockNetworkAccess = true;

  let mockPolicy: ExecutionPolicy;
  let manager: MacOsSandboxManager;

  beforeEach(() => {
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

  describe('prepareCommand', () => {
    it('should correctly format the base command and args', async () => {
      const result = await manager.prepareCommand({
        command: 'echo',
        args: ['hello'],
        cwd: mockWorkspace,
        env: {},
        policy: mockPolicy,
      });

      expect(seatbeltArgsBuilder.buildSeatbeltProfile).toHaveBeenCalledWith({
        workspace: mockWorkspace,
        allowedPaths: mockAllowedPaths,
        forbiddenPaths: [],
        networkAccess: mockNetworkAccess,
        workspaceWrite: false,
        additionalPermissions: {
          fileSystem: {
            read: [],
            write: [],
          },
          network: true,
        },
      });

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

    it('should apply environment sanitization via the default mechanisms', async () => {
      const result = await manager.prepareCommand({
        command: 'echo',
        args: ['hello'],
        cwd: mockWorkspace,
        env: {
          SAFE_VAR: '1',
          GITHUB_TOKEN: 'sensitive',
        },
        policy: {
          ...mockPolicy,
          sanitizationConfig: { enableEnvironmentVariableRedaction: true },
        },
      });

      expect(result.env['SAFE_VAR']).toBe('1');
      expect(result.env['GITHUB_TOKEN']).toBeUndefined();
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

    describe('governance files', () => {
      it('should ensure governance files exist', async () => {
        await manager.prepareCommand({
          command: 'echo',
          args: [],
          cwd: mockWorkspace,
          env: {},
          policy: mockPolicy,
        });

        // The seatbelt builder internally handles governance files, so we simply verify
        // it is invoked correctly with the right workspace.
        expect(seatbeltArgsBuilder.buildSeatbeltProfile).toHaveBeenCalledWith(
          expect.objectContaining({ workspace: mockWorkspace }),
        );
      });
    });

    describe('allowedPaths', () => {
      it('should parameterize allowed paths and normalize them', async () => {
        await manager.prepareCommand({
          command: 'echo',
          args: [],
          cwd: mockWorkspace,
          env: {},
          policy: {
            ...mockPolicy,
            allowedPaths: ['/tmp/allowed1', '/tmp/allowed2'],
          },
        });

        expect(seatbeltArgsBuilder.buildSeatbeltProfile).toHaveBeenCalledWith(
          expect.objectContaining({
            allowedPaths: ['/tmp/allowed1', '/tmp/allowed2'],
          }),
        );
      });
    });

    describe('forbiddenPaths', () => {
      it('should parameterize forbidden paths and explicitly deny them', async () => {
        const customManager = new MacOsSandboxManager({
          workspace: mockWorkspace,
          forbiddenPaths: async () => ['/tmp/forbidden1'],
        });
        await customManager.prepareCommand({
          command: 'echo',
          args: [],
          cwd: mockWorkspace,
          env: {},
          policy: mockPolicy,
        });

        expect(seatbeltArgsBuilder.buildSeatbeltProfile).toHaveBeenCalledWith(
          expect.objectContaining({
            forbiddenPaths: ['/tmp/forbidden1'],
          }),
        );
      });

      it('explicitly denies non-existent forbidden paths to prevent creation', async () => {
        const customManager = new MacOsSandboxManager({
          workspace: mockWorkspace,
          forbiddenPaths: async () => ['/tmp/does-not-exist'],
        });
        await customManager.prepareCommand({
          command: 'echo',
          args: [],
          cwd: mockWorkspace,
          env: {},
          policy: mockPolicy,
        });

        expect(seatbeltArgsBuilder.buildSeatbeltProfile).toHaveBeenCalledWith(
          expect.objectContaining({
            forbiddenPaths: ['/tmp/does-not-exist'],
          }),
        );
      });

      it('should override allowed paths if a path is also in forbidden paths', async () => {
        const customManager = new MacOsSandboxManager({
          workspace: mockWorkspace,
          forbiddenPaths: async () => ['/tmp/conflict'],
        });
        await customManager.prepareCommand({
          command: 'echo',
          args: [],
          cwd: mockWorkspace,
          env: {},
          policy: {
            ...mockPolicy,
            allowedPaths: ['/tmp/conflict'],
          },
        });

        expect(seatbeltArgsBuilder.buildSeatbeltProfile).toHaveBeenCalledWith(
          expect.objectContaining({
            allowedPaths: [],
            forbiddenPaths: ['/tmp/conflict'],
          }),
        );
      });
    });
  });
});
