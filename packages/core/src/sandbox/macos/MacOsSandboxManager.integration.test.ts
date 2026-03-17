/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { MacOsSandboxManager } from './MacOsSandboxManager.js';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

describe('MacOsSandboxManager Integration', () => {
  it.skipIf(os.platform() !== 'darwin')(
    'should execute a simple command successfully under sandbox-exec',
    async () => {
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

      expect(execResult.error).toBeUndefined();
      expect(execResult.status).toBe(0);
      expect(execResult.stdout.trim()).toBe('sandbox test');
    },
  );

  it.skipIf(os.platform() !== 'darwin')(
    'should block file writes outside the workspace',
    async () => {
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

      expect(execResult.error).toBeUndefined();
      expect(execResult.status).not.toBe(0); // Should fail due to permission denied
      expect(execResult.stderr).toContain('Operation not permitted');
    },
  );
});
