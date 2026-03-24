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
    // Mock realpathSync to just return the path for testing
    vi.spyOn(fs, 'realpathSync').mockImplementation((p) => p as string);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(mockWorkspace, { recursive: true, force: true });
    if (mockAllowedPaths && mockAllowedPaths[0]) {
      fs.rmSync(mockAllowedPaths[0], { recursive: true, force: true });
    }
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
      expect(profile).not.toContain('(allow network-outbound)');

      expect(result.args).toContain('-D');
      expect(result.args).toContain(`WORKSPACE=${mockWorkspace}`);
      expect(result.args).toContain(`TMPDIR=${os.tmpdir()}`);

      // Governance files should be protected
      expect(profile).toContain(
        '(deny file-write* (literal (param "GOVERNANCE_FILE_0")))',
      ); // .gitignore
      expect(profile).toContain(
        '(deny file-write* (literal (param "GOVERNANCE_FILE_1")))',
      ); // .geminiignore
      expect(profile).toContain(
        '(deny file-write* (subpath (param "GOVERNANCE_FILE_2")))',
      ); // .git
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
      expect(profile).toContain('(allow network-outbound)');
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
      const baseTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gemini-cli-macos-realpath-test-'),
      );
      const realPath = path.join(baseTmpDir, 'real_path');
      const nonexistentFile = path.join(realPath, 'nonexistent.txt');

      vi.spyOn(fs, 'realpathSync').mockImplementation((p) => {
        if (p === nonexistentFile) {
          const error = new Error('ENOENT');
          Object.assign(error, { code: 'ENOENT' });
          throw error;
        }
        if (p === realPath) {
          return path.join(baseTmpDir, 'resolved_path');
        }
        return p as string;
      });

      try {
        const dynamicManager = new MacOsSandboxManager({
          workspace: nonexistentFile,
        });
        const dynamicResult = await dynamicManager.prepareCommand({
          command: 'echo',
          args: ['hello'],
          cwd: nonexistentFile,
          env: {},
        });

        expect(dynamicResult.args).toContain(
          `WORKSPACE=${path.join(baseTmpDir, 'resolved_path', 'nonexistent.txt')}`,
        );
      } finally {
        fs.rmSync(baseTmpDir, { recursive: true, force: true });
      }
    });

    it('should throw if realpathSync throws a non-ENOENT error', async () => {
      vi.spyOn(fs, 'realpathSync').mockImplementation(() => {
        const error = new Error('Permission denied');
        Object.assign(error, { code: 'EACCES' });
        throw error;
      });

      const errorManager = new MacOsSandboxManager({
        workspace: mockWorkspace,
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
