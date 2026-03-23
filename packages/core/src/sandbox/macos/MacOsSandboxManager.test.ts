/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MacOsSandboxManager } from './MacOsSandboxManager.js';
import type { ExecutionPolicy } from '../../services/sandboxManager.js';
import fs from 'node:fs';
import os from 'node:os';

describe('MacOsSandboxManager', () => {
  const mockWorkspace = '/test/workspace';
  const mockAllowedPaths = ['/test/allowed'];
  const mockNetworkAccess = true;

  const mockPolicy: ExecutionPolicy = {
    allowedPaths: mockAllowedPaths,
    networkAccess: mockNetworkAccess,
  };

  let manager: MacOsSandboxManager;

  beforeEach(() => {
    manager = new MacOsSandboxManager({ workspace: mockWorkspace });
    // Mock realpathSync to just return the path for testing
    vi.spyOn(fs, 'realpathSync').mockImplementation((p) => p as string);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('prepareCommand', () => {
    it('should build a strict allowlist profile allowing the workspace via param', async () => {
      const result = await manager.prepareCommand({
        command: 'echo',
        args: ['hello'],
        cwd: mockWorkspace,
        env: {},
        policy: { networkAccess: false },
      });

      expect(result.program).toBe('/usr/bin/sandbox-exec');
      const profile = result.args[1];
      expect(profile).toContain('(version 1)');
      expect(profile).toContain('(deny default)');
      expect(profile).toContain('(allow process-exec)');
      expect(profile).toContain('(subpath (param "WORKSPACE"))');
      expect(profile).not.toContain('(allow network*)');

      expect(result.args).toContain('-D');
      expect(result.args).toContain('WORKSPACE=/test/workspace');
      expect(result.args).toContain(`TMPDIR=${os.tmpdir()}`);
    });

    it('should allow network when networkAccess is true in policy', async () => {
      const result = await manager.prepareCommand({
        command: 'curl',
        args: ['example.com'],
        cwd: mockWorkspace,
        env: {},
        policy: { networkAccess: true },
      });

      const profile = result.args[1];
      expect(profile).toContain('(allow network*)');
    });

    it('should parameterize allowed paths and normalize them', async () => {
      vi.spyOn(fs, 'realpathSync').mockImplementation((p) => {
        if (p === '/test/symlink') return '/test/real_path';
        return p as string;
      });

      const result = await manager.prepareCommand({
        command: 'ls',
        args: ['/custom/path1'],
        cwd: mockWorkspace,
        env: {},
        policy: {
          allowedPaths: ['/custom/path1', '/test/symlink'],
        },
      });

      const profile = result.args[1];
      expect(profile).toContain('(subpath (param "ALLOWED_PATH_0"))');
      expect(profile).toContain('(subpath (param "ALLOWED_PATH_1"))');

      expect(result.args).toContain('-D');
      expect(result.args).toContain('ALLOWED_PATH_0=/custom/path1');
      expect(result.args).toContain('ALLOWED_PATH_1=/test/real_path');
    });

    it('should format the executable and arguments correctly for sandbox-exec', async () => {
      const result = await manager.prepareCommand({
        command: 'echo',
        args: ['hello'],
        cwd: mockWorkspace,
        env: {},
        policy: mockPolicy,
      });

      expect(result.program).toBe('/usr/bin/sandbox-exec');
      expect(result.args.slice(-3)).toEqual(['--', 'echo', 'hello']);
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

    it('should resolve parent directories if a file does not exist', async () => {
      vi.spyOn(fs, 'realpathSync').mockImplementation((p) => {
        if (p === '/test/symlink/nonexistent.txt') {
          const error = new Error('ENOENT');
          Object.assign(error, { code: 'ENOENT' });
          throw error;
        }
        if (p === '/test/symlink') {
          return '/test/real_path';
        }
        return p as string;
      });

      const dynamicManager = new MacOsSandboxManager({
        workspace: '/test/symlink/nonexistent.txt',
      });
      const dynamicResult = await dynamicManager.prepareCommand({
        command: 'echo',
        args: ['hello'],
        cwd: '/test/symlink/nonexistent.txt',
        env: {},
      });

      expect(dynamicResult.args).toContain(
        'WORKSPACE=/test/real_path/nonexistent.txt',
      );
    });

    it('should throw if realpathSync throws a non-ENOENT error', async () => {
      vi.spyOn(fs, 'realpathSync').mockImplementation(() => {
        const error = new Error('Permission denied');
        Object.assign(error, { code: 'EACCES' });
        throw error;
      });

      const errorManager = new MacOsSandboxManager({
        workspace: '/test/workspace',
      });
      await expect(
        errorManager.prepareCommand({
          command: 'echo',
          args: ['hello'],
          cwd: mockWorkspace,
          env: {},
        }),
      ).rejects.toThrow('Permission denied');
    });
  });
});
