/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { MacOsSandboxManager } from './MacOsSandboxManager.js';
import { ShellExecutionService } from '../../services/shellExecutionService.js';
import { getSecureSanitizationConfig } from '../../services/environmentSanitization.js';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

describe.skipIf(os.platform() !== 'darwin')(
  'MacOsSandboxManager Integration',
  () => {
    it('should execute basic commands within the workspace', async () => {
      const manager = new MacOsSandboxManager({ workspace: process.cwd() });
      const result = await manager.prepareCommand({
        command: 'echo',
        args: ['sandbox test'],
        cwd: process.cwd(),
        env: process.env,
      });

      const execResult = spawnSync(result.program, result.args, {
        cwd: result.cwd,
        env: result.env,
        encoding: 'utf-8',
      });

      expect(execResult.status).toBe(0);
      expect(execResult.stdout.trim()).toBe('sandbox test');
    });

    it('should support interactive pseudo-terminals (node-pty)', async () => {
      const manager = new MacOsSandboxManager({ workspace: process.cwd() });
      const abortController = new AbortController();

      // Verify that node-pty file descriptors are successfully allocated inside the sandbox
      // by using the bash [ -t 1 ] idiom to check if stdout is a TTY.
      const handle = await ShellExecutionService.execute(
        'bash -c "if [ -t 1 ]; then echo True; else echo False; fi"',
        process.cwd(),
        () => {},
        abortController.signal,
        true,
        {
          sanitizationConfig: getSecureSanitizationConfig(),
          sandboxManager: manager,
        },
      );

      const result = await handle.result;
      expect(result.error).toBeNull();
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('True');
    });

    it('should block file system access outside the workspace', async () => {
      const manager = new MacOsSandboxManager({ workspace: process.cwd() });
      const blockedPath = os.homedir() + '/.gemini_test_sandbox_blocked';

      const result = await manager.prepareCommand({
        command: 'touch',
        args: [blockedPath],
        cwd: process.cwd(),
        env: process.env,
      });

      const execResult = spawnSync(result.program, result.args, {
        cwd: result.cwd,
        env: result.env,
        encoding: 'utf-8',
      });

      expect(execResult.status).not.toBe(0);
      expect(execResult.stderr).toContain('Operation not permitted');
    });

    it('should allow file system access to explicitly allowed paths', async () => {
      const allowedDir = os.tmpdir() + '/gemini_test_sandbox_allowed';
      spawnSync('mkdir', ['-p', allowedDir]);

      const manager = new MacOsSandboxManager({
        workspace: process.cwd(),
        allowedPaths: [allowedDir],
      });
      const testFile = allowedDir + '/test.txt';

      const result = await manager.prepareCommand({
        command: 'touch',
        args: [testFile],
        cwd: process.cwd(),
        env: process.env,
      });

      const execResult = spawnSync(result.program, result.args, {
        cwd: result.cwd,
        env: result.env,
        encoding: 'utf-8',
      });

      expect(execResult.status).toBe(0);

      spawnSync('rm', ['-rf', allowedDir]);
    });

    it('should block network access by default', async () => {
      const manager = new MacOsSandboxManager({ workspace: process.cwd() });
      const result = await manager.prepareCommand({
        command: 'curl',
        args: ['-s', '--connect-timeout', '1', 'https://1.1.1.1'],
        cwd: process.cwd(),
        env: process.env,
      });

      const execResult = spawnSync(result.program, result.args, {
        cwd: result.cwd,
        env: result.env,
        encoding: 'utf-8',
      });

      expect(execResult.status).not.toBe(0);
    });

    it('should allow network access when explicitly requested', async () => {
      const manager = new MacOsSandboxManager({
        workspace: process.cwd(),
        networkAccess: true,
      });
      const result = await manager.prepareCommand({
        command: 'curl',
        args: ['-s', '--connect-timeout', '3', 'https://1.1.1.1'],
        cwd: process.cwd(),
        env: process.env,
      });

      const execResult = spawnSync(result.program, result.args, {
        cwd: result.cwd,
        env: result.env,
        encoding: 'utf-8',
      });

      expect(execResult.status).toBe(0);
    });
  },
);
