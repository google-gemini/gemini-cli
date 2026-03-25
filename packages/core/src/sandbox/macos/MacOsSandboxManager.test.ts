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
    vi.spyOn(seatbeltArgsBuilder, 'buildSeatbeltArgs').mockResolvedValue([
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
    it('should correctly orchestrate Seatbelt args and format the final command', async () => {
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
  });
});
