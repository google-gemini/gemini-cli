/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {describe, expect, it, vi} from 'vitest';
import {getPty} from '../utils/getPty.js';
import {ShellExecutionService} from './shellExecutionService.js';
import {NoopSandboxManager} from './sandboxManager.js';

const ptyInfo = await getPty();
const hasPty = ptyInfo !== null;

describe('ShellExecutionService Native Integration', () => {
  // Guard the tests to skip if PTY is not available (e.g., hermetic environments)
  it.runIf(hasPty)(
    'should execute a simple command natively using PTY',
    async () => {
      const abortController = new AbortController();
      const onOutputEvent = vi.fn();

      const handle = await ShellExecutionService.execute(
        'echo "hello native"',
        process.cwd(),
        onOutputEvent,
        abortController.signal,
        true, // shouldUseNodePty
        {
          enableInteractiveShell: false, // Enforce TERM=dumb
          sandboxManager: new NoopSandboxManager(),
          sanitizationConfig: {
            enableEnvironmentVariableRedaction: false,
            allowedEnvironmentVariables: [],
            blockedEnvironmentVariables: [],
          },
        },
      );

      expect(handle.pid).toBeGreaterThan(0);

      const result = await handle.result;
      expect(result.exitCode).toBe(0);
      expect(result.executionMethod).not.toBe('child_process');
      expect(result.executionMethod).not.toBe('none');
      expect(result.output.trim()).toContain('hello native');
    },
  );

  it.runIf(hasPty)(
    'should enforce TERM=dumb when interactive shell is disabled natively',
    async () => {
      const abortController = new AbortController();
      const onOutputEvent = vi.fn();

      const cmd =
        process.platform === 'win32' ? 'echo $env:TERM' : 'printenv TERM';

      const handle = await ShellExecutionService.execute(
        cmd,
        process.cwd(),
        onOutputEvent,
        abortController.signal,
        true,
        {
          enableInteractiveShell: false,
          sandboxManager: new NoopSandboxManager(),
          sanitizationConfig: {
            enableEnvironmentVariableRedaction: false,
            allowedEnvironmentVariables: [],
            blockedEnvironmentVariables: [],
          },
        },
      );

      const result = await handle.result;
      expect(result.exitCode).toBe(0);
      expect(result.output.trim()).toBe('dumb');
    },
  );
});
