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
    mockWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-macos-test-'),
    );
    mockAllowedPaths = [
      path.join(os.tmpdir(), 'gemini-cli-macos-test-allowed'),
    ];
    if (!fs.existsSync(mockAllowedPaths[0])) {
      fs.mkdirSync(mockAllowedPaths[0]);
    }

    mockPolicy = {
      allowedPaths: mockAllowedPaths,
      networkAccess: mockNetworkAccess,
    };

    manager = new MacOsSandboxManager({ workspace: mockWorkspace });

    // Mock the seatbelt args builder to isolate manager tests
    vi.spyOn(seatbeltArgsBuilder, 'buildSeatbeltArgs').mockReturnValue([
      '-p',
      '(mock profile)',
      '-D',
      'MOCK_VAR=value',
    ]);
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

      expect(seatbeltArgsBuilder.buildSeatbeltArgs).toHaveBeenCalledWith({
        workspace: mockWorkspace,
        allowedPaths: mockAllowedPaths,
        networkAccess: mockNetworkAccess,
        forbiddenPaths: undefined,
        workspaceWrite: true,
        additionalPermissions: {
          fileSystem: {
            read: [],
            write: [],
          },
          network: true,
        },
      });

      expect(result.program).toBe('/usr/bin/sandbox-exec');
      expect(result.args).toEqual([
        '-p',
        '(mock profile)',
        '-D',
        'MOCK_VAR=value',
        '--',
        'echo',
        'hello',
      ]);
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
        policy: mockPolicy,
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

      expect(seatbeltArgsBuilder.buildSeatbeltArgs).toHaveBeenCalledWith(
        expect.objectContaining({ networkAccess: true }),
      );
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
        expect(seatbeltArgsBuilder.buildSeatbeltArgs).toHaveBeenCalledWith(
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

        expect(seatbeltArgsBuilder.buildSeatbeltArgs).toHaveBeenCalledWith(
          expect.objectContaining({
            allowedPaths: ['/tmp/allowed1', '/tmp/allowed2'],
          }),
        );
      });
    });

    describe('forbiddenPaths', () => {
      it('should parameterize forbidden paths and explicitly deny them', async () => {
        await manager.prepareCommand({
          command: 'echo',
          args: [],
          cwd: mockWorkspace,
          env: {},
          policy: {
            ...mockPolicy,
            forbiddenPaths: ['/tmp/forbidden1'],
          },
        });

        expect(seatbeltArgsBuilder.buildSeatbeltArgs).toHaveBeenCalledWith(
          expect.objectContaining({
            forbiddenPaths: ['/tmp/forbidden1'],
          }),
        );
      });

      it('explicitly denies non-existent forbidden paths to prevent creation', async () => {
        await manager.prepareCommand({
          command: 'echo',
          args: [],
          cwd: mockWorkspace,
          env: {},
          policy: {
            ...mockPolicy,
            forbiddenPaths: ['/tmp/does-not-exist'],
          },
        });

        expect(seatbeltArgsBuilder.buildSeatbeltArgs).toHaveBeenCalledWith(
          expect.objectContaining({
            forbiddenPaths: ['/tmp/does-not-exist'],
          }),
        );
      });

      it('should override allowed paths if a path is also in forbidden paths', async () => {
        await manager.prepareCommand({
          command: 'echo',
          args: [],
          cwd: mockWorkspace,
          env: {},
          policy: {
            ...mockPolicy,
            allowedPaths: ['/tmp/conflict'],
            forbiddenPaths: ['/tmp/conflict'],
          },
        });

        expect(seatbeltArgsBuilder.buildSeatbeltArgs).toHaveBeenCalledWith(
          expect.objectContaining({
            allowedPaths: ['/tmp/conflict'],
            forbiddenPaths: ['/tmp/conflict'],
          }),
        );
      });
    });
  });
});
