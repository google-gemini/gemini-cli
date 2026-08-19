/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { ShellExecutionService } from './shellExecutionService.js';
import { NoopSandboxManager } from './sandboxManager.js';

const isWindows = os.platform() === 'win32';

/**
 * Real-shell integration tests that reproduce the regression class from
 * issue #25859: commands with inline double quotes executed on Windows
 * lose their quotes when they reach the native executable, because
 * Windows PowerShell 5.1 mangles embedded " during native-command
 * argument passing. PowerShell 7 (pwsh.exe) passes arguments correctly.
 *
 * These tests exercise the full pipeline end-to-end. They pass when
 * gemini-cli selects pwsh.exe from PATH; they fail when the pipeline
 * routes through Windows PowerShell 5.1.
 */
describe.skipIf(!isWindows)(
  'ShellExecutionService Windows quoting (real shell)',
  () => {
    const baseConfig = {
      sanitizationConfig: {
        allowedEnvironmentVariables: [],
        blockedEnvironmentVariables: [],
        enableEnvironmentVariableRedaction: false,
      },
      sandboxManager: new NoopSandboxManager(),
    };

    async function runReal(command: string) {
      const controller = new AbortController();
      const handle = await ShellExecutionService.execute(
        command,
        process.cwd(),
        () => {},
        controller.signal,
        false,
        baseConfig,
      );
      const result = await handle.result;
      return { result, output: result.output };
    }

    it('should preserve inline double quotes through node -e', async () => {
      const { result, output } = await runReal(
        `node -e 'console.log("preserved")'`,
      );
      expect(result.exitCode).toBe(0);
      expect(output).toBe('preserved');
    });

    it('should preserve double quotes inside JSON output', async () => {
      const { result, output } = await runReal(
        `node -e 'console.log(JSON.stringify({ok:"yes"}))'`,
      );
      expect(result.exitCode).toBe(0);
      expect(output).toBe('{"ok":"yes"}');
    });

    it('should handle quoted argument containing a space', async () => {
      const { result, output } = await runReal(
        `node -e "console.log('hello world')"`,
      );
      expect(result.exitCode).toBe(0);
      expect(output).toBe('hello world');
    });

    it('should handle a mixed-quote regex literal', async () => {
      const { result, output } = await runReal(
        `node -e 'console.log(String("a").match(/"/))'`,
      );
      expect(result.exitCode).toBe(0);
      expect(output).toBe('null');
    });

    it('should pass a literal double-quote byte through to stdout', async () => {
      const { result, output } = await runReal(`node -e 'console.log("\\"")'`);
      expect(result.exitCode).toBe(0);
      expect(output).toBe('"');
    });
  },
);
