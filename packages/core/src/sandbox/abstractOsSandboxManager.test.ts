/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AbstractOsSandboxManager,
  resolveSandboxPaths,
} from './abstractOsSandboxManager.js';
import type {
  GlobalSandboxOptions,
  SandboxedCommand,
  SandboxPermissions,
  SandboxRequest,
} from '../services/sandboxManager.js';
import type { ResolvedSandboxPaths } from './abstractOsSandboxManager.js';

class TestSandboxManager extends AbstractOsSandboxManager {
  override isKnownSafeCommand = vi.fn().mockReturnValue(false);
  override isDangerousCommand = vi.fn().mockReturnValue(false);
  override parseDenials = vi.fn().mockReturnValue(undefined);

  protected get isCaseInsensitive(): boolean {
    return true;
  }

  protected override resolveFinalCommand = vi
    .fn()
    .mockImplementation((req) => ({
      command: req.command,
      args: req.args,
    }));
  protected override buildSandboxedExecution = vi.fn().mockResolvedValue({
    program: 'test-program',
    args: [],
    env: {},
  } as SandboxedCommand);

  constructor(options: GlobalSandboxOptions) {
    super(options);
  }
}

describe('AbstractOsSandboxManager', () => {
  let mockWorkspace: string;
  let manager: TestSandboxManager;

  beforeEach(() => {
    mockWorkspace = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-base-sandbox-test-')),
    );
    manager = new TestSandboxManager({ workspace: mockWorkspace });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(mockWorkspace, { recursive: true, force: true });
  });

  describe('isToolApproved', () => {
    it('should return false if no approved tools are configured', () => {
      const emptyManager = new TestSandboxManager({ workspace: mockWorkspace });
      expect(emptyManager['isToolApproved']('ls')).toBe(false);
    });

    it('should return true if the tool matches exactly', () => {
      const managerWithTools = new TestSandboxManager({
        workspace: mockWorkspace,
        modeConfig: { approvedTools: ['git'] },
      });
      expect(managerWithTools['isToolApproved']('git')).toBe(true);
      expect(managerWithTools['isToolApproved']('ls')).toBe(false);
    });

    it('should respect case-insensitivity when requested', () => {
      const managerWithTools = new TestSandboxManager({
        workspace: mockWorkspace,
        modeConfig: { approvedTools: ['GIT'] },
      });
      expect(managerWithTools['isToolApproved']('git', true)).toBe(true);
      expect(managerWithTools['isToolApproved']('git', false)).toBe(false);
    });
  });

  describe('touch', () => {
    it('should create a directory if isDirectory is true', () => {
      const targetDir = path.join(mockWorkspace, 'newDir');
      manager['touch'](targetDir, true);
      expect(fs.existsSync(targetDir)).toBe(true);
      expect(fs.lstatSync(targetDir).isDirectory()).toBe(true);
    });

    it('should create an empty file and its parent directories if isDirectory is false', () => {
      const targetFile = path.join(mockWorkspace, 'newDir', 'newFile.txt');
      manager['touch'](targetFile, false);
      expect(fs.existsSync(targetFile)).toBe(true);
      expect(fs.lstatSync(targetFile).isFile()).toBe(true);
    });

    it('should do nothing if the path already exists', () => {
      const targetDir = path.join(mockWorkspace, 'existingDir');
      fs.mkdirSync(targetDir);
      expect(() => manager['touch'](targetDir, true)).not.toThrow();
    });

    it('should not throw if the path exists as a broken symlink', () => {
      const targetLink = path.join(mockWorkspace, 'brokenLink');
      const nonExistentTarget = path.join(mockWorkspace, 'nonExistent');
      fs.symlinkSync(nonExistentTarget, targetLink);
      expect(() => manager['touch'](targetLink, false)).not.toThrow();
    });
  });

  describe('prepareCommand', () => {
    it('applies environment sanitization', async () => {
      await manager.prepareCommand({
        command: 'echo',
        args: [],
        cwd: mockWorkspace,
        env: {
          SAFE_VAR: '1',
          API_KEY: 'sensitive',
        },
        policy: {
          sanitizationConfig: {
            enableEnvironmentVariableRedaction: true,
            blockedEnvironmentVariables: ['API_KEY'],
            allowedEnvironmentVariables: ['SAFE_VAR'],
          },
        },
      });

      const call = manager['buildSandboxedExecution'].mock.calls[0];
      const sanitizedEnv = call[2]; // 3rd arg is sanitizedEnv
      expect(sanitizedEnv['SAFE_VAR']).toBe('1');
      expect(sanitizedEnv['API_KEY']).toBeUndefined();
    });

    it('rejects overrides in plan mode', async () => {
      const planManager = new TestSandboxManager({
        workspace: mockWorkspace,
        modeConfig: { readonly: true, allowOverrides: false },
      });

      await expect(
        planManager.prepareCommand({
          command: 'echo',
          args: [],
          cwd: mockWorkspace,
          env: {},
          policy: { additionalPermissions: { network: true } },
        }),
      ).rejects.toThrow(/Cannot override/);
    });

    it('ensures governance files exist before execution', async () => {
      await manager.prepareCommand({
        command: 'echo',
        args: [],
        cwd: mockWorkspace,
        env: {},
      });

      expect(fs.existsSync(path.join(mockWorkspace, '.gitignore'))).toBe(true);
      expect(fs.existsSync(path.join(mockWorkspace, '.geminiignore'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(mockWorkspace, '.git'))).toBe(true);
      expect(fs.lstatSync(path.join(mockWorkspace, '.git')).isDirectory()).toBe(
        true,
      );
    });

    it('resolves path and permissions, passing them to buildSandboxedExecution', async () => {
      await manager.prepareCommand({
        command: 'echo',
        args: [],
        cwd: mockWorkspace,
        env: {},
        policy: {
          allowedPaths: ['/tmp/allowed'],
          networkAccess: true,
        },
      });

      expect(manager['buildSandboxedExecution']).toHaveBeenCalled();
      const callArgs = manager['buildSandboxedExecution'].mock.calls[0];
      const mergedPermissions = callArgs[3] as SandboxPermissions;
      const resolvedPaths = callArgs[4] as ResolvedSandboxPaths;

      expect(mergedPermissions.network).toBe(true);
      // It expands allowedPaths into its original and resolved forms (which defaults to original on missing files unless symlinked)
      expect(resolvedPaths.policyAllowed).toContain('/tmp/allowed');
    });

    it('resolves workspaceWrite to true when in yolo mode', async () => {
      const yoloManager = new TestSandboxManager({
        workspace: mockWorkspace,
        modeConfig: { readonly: true, allowOverrides: true, yolo: true },
      });

      await yoloManager.prepareCommand({
        command: 'echo',
        args: [],
        cwd: mockWorkspace,
        env: {},
      });

      const callArgs = yoloManager['buildSandboxedExecution'].mock.calls[0];
      const workspaceWrite = callArgs[5] as boolean;
      expect(workspaceWrite).toBe(true);
    });
  });

  describe('resolveSandboxPaths', () => {
    it('should resolve allowed and forbidden paths', async () => {
      const workspace = path.resolve('/workspace');
      const forbidden = path.join(workspace, 'forbidden');
      const allowed = path.join(workspace, 'allowed');
      const options = {
        workspace,
        forbiddenPaths: async () => [forbidden],
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: workspace,
        env: {},
        policy: {
          allowedPaths: [allowed],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.policyAllowed).toEqual([allowed]);
      expect(result.forbidden).toEqual([forbidden]);
    });

    it('should filter out workspace from allowed paths', async () => {
      const workspace = path.resolve('/workspace');
      const other = path.resolve('/other/path');
      const options = {
        workspace,
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: workspace,
        env: {},
        policy: {
          allowedPaths: [workspace, workspace + path.sep, other],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.policyAllowed).toEqual([other]);
    });

    it('should prioritize forbidden paths over allowed paths', async () => {
      const workspace = path.resolve('/workspace');
      const secret = path.join(workspace, 'secret');
      const normal = path.join(workspace, 'normal');
      const options = {
        workspace,
        forbiddenPaths: async () => [secret],
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: workspace,
        env: {},
        policy: {
          allowedPaths: [secret, normal],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.policyAllowed).toEqual([normal]);
      expect(result.forbidden).toEqual([secret]);
    });

    it('should handle case-insensitive conflicts on supported platforms', async () => {
      vi.spyOn(os, 'platform').mockReturnValue('darwin');
      const workspace = path.resolve('/workspace');
      const secretUpper = path.join(workspace, 'SECRET');
      const secretLower = path.join(workspace, 'secret');
      const options = {
        workspace,
        forbiddenPaths: async () => [secretUpper],
      };
      const req = {
        command: 'ls',
        args: [],
        cwd: workspace,
        env: {},
        policy: {
          allowedPaths: [secretLower],
        },
      };

      const result = await resolveSandboxPaths(options, req as SandboxRequest);

      expect(result.policyAllowed).toEqual([]);
      expect(result.forbidden).toEqual([secretUpper]);
    });
  });
});
