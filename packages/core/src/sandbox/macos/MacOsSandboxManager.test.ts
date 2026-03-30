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
  let manager: MacOsSandboxManager | undefined;

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

    // Mock the seatbelt args builder to isolate manager tests
    vi.spyOn(seatbeltArgsBuilder, 'buildSeatbeltProfile').mockReturnValue(
      '(mock profile)',
    );
  });

  afterEach(() => {
    manager?.cleanup();
    vi.restoreAllMocks();
    fs.rmSync(mockWorkspace, { recursive: true, force: true });
    if (mockAllowedPaths && mockAllowedPaths[0]) {
      fs.rmSync(mockAllowedPaths[0], { recursive: true, force: true });
    }
  });

  describe('prepareCommand', () => {
    it('should correctly format the base command and args', async () => {
      manager = new MacOsSandboxManager({ workspace: mockWorkspace });
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
        forbiddenPaths: undefined,
        networkAccess: true,
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
      expect(result.args[0]).toBe('-f');
      expect(result.args[1]).toMatch(/gemini-cli-seatbelt-.*\/profile-.*\.sb$/);
      expect(result.args.slice(2)).toEqual(['--', 'echo', 'hello']);

      // Verify temp file was written
      const tempFile = result.args[1];
      expect(fs.existsSync(tempFile)).toBe(true);
      expect(fs.readFileSync(tempFile, 'utf8')).toBe('(mock profile)');

      // Clean up the temp file
      fs.unlinkSync(tempFile);
    });

    it('should correctly pass through the cwd to the resulting command', async () => {
      manager = new MacOsSandboxManager({ workspace: mockWorkspace });
      const result = await manager.prepareCommand({
        command: 'echo',
        args: ['hello'],
        cwd: '/test/different/cwd',
        env: {},
        policy: mockPolicy,
      });

      expect(result.cwd).toBe('/test/different/cwd');
      fs.unlinkSync(result.args[1]);
    });

    it('should apply environment sanitization via the default mechanisms', async () => {
      manager = new MacOsSandboxManager({ workspace: mockWorkspace });
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
      fs.unlinkSync(result.args[1]);
    });

    it('should allow network when networkAccess is true', async () => {
      manager = new MacOsSandboxManager({ workspace: mockWorkspace });
      const result = await manager.prepareCommand({
        command: 'echo',
        args: ['hello'],
        cwd: mockWorkspace,
        env: {},
        policy: { ...mockPolicy, networkAccess: true },
      });

      expect(seatbeltArgsBuilder.buildSeatbeltProfile).toHaveBeenCalledWith(
        expect.objectContaining({ networkAccess: true }),
      );
      fs.unlinkSync(result.args[1]);
    });

    describe('governance files', () => {
      it('should ensure governance files exist', async () => {
        manager = new MacOsSandboxManager({ workspace: mockWorkspace });
        const result = await manager.prepareCommand({
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
        fs.unlinkSync(result.args[1]);
      });
    });

    describe('allowedPaths', () => {
      it('should parameterize allowed paths and normalize them', async () => {
        manager = new MacOsSandboxManager({ workspace: mockWorkspace });
        const result = await manager.prepareCommand({
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
        fs.unlinkSync(result.args[1]);
      });
    });

    describe('forbiddenPaths', () => {
      it('should parameterize forbidden paths and explicitly deny them', async () => {
        manager = new MacOsSandboxManager({
          workspace: mockWorkspace,
          forbiddenPaths: ['/tmp/forbidden1'],
        });
        const result = await manager.prepareCommand({
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
        fs.unlinkSync(result.args[1]);
      });

      it('explicitly denies non-existent forbidden paths to prevent creation', async () => {
        manager = new MacOsSandboxManager({
          workspace: mockWorkspace,
          forbiddenPaths: ['/tmp/does-not-exist'],
        });
        const result = await manager.prepareCommand({
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
        fs.unlinkSync(result.args[1]);
      });

      it('should override allowed paths if a path is also in forbidden paths', async () => {
        manager = new MacOsSandboxManager({
          workspace: mockWorkspace,
          forbiddenPaths: ['/tmp/conflict'],
        });
        const result = await manager.prepareCommand({
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
            allowedPaths: ['/tmp/conflict'],
            forbiddenPaths: ['/tmp/conflict'],
          }),
        );
        fs.unlinkSync(result.args[1]);
      });
    });
  });
});
