/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration tests for experimental.windowsBash — verifies that Unix-syntax
 * commands execute correctly through a real bash binary on any OS.
 *
 * Tests are skipped automatically when bash is not on PATH (e.g. Windows
 * without Git for Windows).  On Linux and macOS bash is always present, so
 * all tests run unconditionally on those platforms.
 *
 * Run: npm run test:integration:sandbox:none -- windows-bash.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ShellExecutionService,
  type ShellExecutionConfig,
} from '../packages/core/src/services/shellExecutionService.js';
import { NoopSandboxManager } from '../packages/core/src/services/sandboxManager.js';
import {
  resolveBashOnPath,
  clearBashPathCache,
} from '../packages/core/src/utils/shell-utils.js';

// ---------------------------------------------------------------------------
// Resolve bash path once at module load time so that it.skipIf() predicates
// can use it.  Top-level await is valid in ESM test files.
// ---------------------------------------------------------------------------
clearBashPathCache();
const bashPath = await resolveBashOnPath();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_CONFIG: ShellExecutionConfig = {
  sanitizationConfig: {
    enableEnvironmentVariableRedaction: false,
    allowedEnvironmentVariables: [],
    blockedEnvironmentVariables: [],
  },
  sandboxManager: new NoopSandboxManager(),
  disableDynamicLineTrimming: true,
};

async function runCmd(
  command: string,
  config: Partial<ShellExecutionConfig> = {},
  cwd = process.cwd(),
): Promise<{ output: string; exitCode: number | null }> {
  ShellExecutionService.resetForTest();
  const handle = await ShellExecutionService.execute(
    command,
    cwd,
    () => {},
    new AbortController().signal,
    false,
    { ...BASE_CONFIG, ...config },
  );
  const result = await handle.result;
  return { output: result.output.trim(), exitCode: result.exitCode };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('windowsBash integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'gemini-bash-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ---- Platform-agnostic sanity ----------------------------------------

  it('resolveBashOnPath returns a path string or undefined', () => {
    expect(bashPath === undefined || typeof bashPath === 'string').toBe(true);
  });

  // ---- Tests that require bash on PATH ---------------------------------
  //
  // On Linux/macOS bash is always available; on Windows it requires Git Bash,
  // MSYS2, WSL, or another bash provider in PATH.

  it.skipIf(bashPath === undefined)(
    'executes a simple echo command through bash',
    async () => {
      const { output, exitCode } = await runCmd('echo hello-from-bash', {
        enableWindowsBash: true,
      });
      expect(exitCode).toBe(0);
      expect(output).toContain('hello-from-bash');
    },
  );

  it.skipIf(bashPath === undefined)(
    'supports && operator — both commands run on success',
    async () => {
      const { output, exitCode } = await runCmd('echo first && echo second', {
        enableWindowsBash: true,
      });
      expect(exitCode).toBe(0);
      expect(output).toContain('first');
      expect(output).toContain('second');
    },
  );

  it.skipIf(bashPath === undefined)(
    '&& short-circuits — second command does not run after failure',
    async () => {
      const { output, exitCode } = await runCmd(
        'false && echo should-not-appear',
        { enableWindowsBash: true },
      );
      expect(exitCode).not.toBe(0);
      expect(output).not.toContain('should-not-appear');
    },
  );

  it.skipIf(bashPath === undefined)(
    'supports || — fallback command runs when first fails',
    async () => {
      const { output, exitCode } = await runCmd('false || echo fallback-ran', {
        enableWindowsBash: true,
      });
      expect(exitCode).toBe(0);
      expect(output).toContain('fallback-ran');
    },
  );

  it.skipIf(bashPath === undefined)(
    'supports pipes — stdout of one command feeds stdin of next',
    async () => {
      const { output, exitCode } = await runCmd(
        'printf "alpha\\nbeta\\ngamma" | grep beta',
        { enableWindowsBash: true },
      );
      expect(exitCode).toBe(0);
      expect(output).toContain('beta');
      expect(output).not.toContain('alpha');
      expect(output).not.toContain('gamma');
    },
  );

  it.skipIf(bashPath === undefined)(
    'redirects stdout to /dev/null without error',
    async () => {
      const { exitCode } = await runCmd(
        'echo discard > /dev/null && echo still-runs',
        { enableWindowsBash: true },
      );
      expect(exitCode).toBe(0);
    },
  );

  it.skipIf(bashPath === undefined)(
    'supports unix-style variable assignment and expansion',
    async () => {
      const { output, exitCode } = await runCmd(
        'GREETING=hello-bash; echo $GREETING',
        { enableWindowsBash: true },
      );
      expect(exitCode).toBe(0);
      expect(output).toContain('hello-bash');
    },
  );

  it.skipIf(bashPath === undefined)(
    'ls -la lists directory contents',
    async () => {
      const { output, exitCode } = await runCmd(
        `ls -la "${tmpDir}"`,
        { enableWindowsBash: true },
        tmpDir,
      );
      expect(exitCode).toBe(0);
      // ls -la always shows . and .. entries
      expect(output).toMatch(/\./);
    },
  );

  it.skipIf(bashPath === undefined)(
    'semicolon-separated commands all execute',
    async () => {
      const { output, exitCode } = await runCmd(
        'echo line1; echo line2; echo line3',
        { enableWindowsBash: true },
      );
      expect(exitCode).toBe(0);
      expect(output).toContain('line1');
      expect(output).toContain('line2');
      expect(output).toContain('line3');
    },
  );

  it.skipIf(bashPath === undefined)(
    'exit code is correctly propagated',
    async () => {
      const { exitCode } = await runCmd('exit 42', {
        enableWindowsBash: true,
      });
      expect(exitCode).toBe(42);
    },
  );

  it.skipIf(bashPath === undefined)(
    'subshell command substitution works',
    async () => {
      const { output, exitCode } = await runCmd(
        'echo "result: $(echo inner)"',
        { enableWindowsBash: true },
      );
      expect(exitCode).toBe(0);
      expect(output).toContain('result: inner');
    },
  );

  it.skipIf(bashPath === undefined)(
    'writes a file and reads it back with cat',
    async () => {
      const filePath = join(tmpDir, 'test.txt').replaceAll('\\', '/');
      const { output, exitCode } = await runCmd(
        `echo "file-content" > "${filePath}" && cat "${filePath}"`,
        { enableWindowsBash: true },
        tmpDir,
      );
      expect(exitCode).toBe(0);
      expect(output).toContain('file-content');
    },
  );

  // ---- Windows-specific: verify the bash binary path is actually used ----

  it.skipIf(bashPath === undefined || os.platform() !== 'win32')(
    'on Windows, enableWindowsBash routes through the resolved bash binary',
    async () => {
      const { output, exitCode } = await runCmd(
        'echo windows-bash-active && printf "done\\n"',
        { enableWindowsBash: true },
      );
      expect(exitCode).toBe(0);
      expect(output).toContain('windows-bash-active');
      expect(output).toContain('done');
    },
  );

  // ---- Control: windowsBash disabled uses the platform default shell ------

  it('without windowsBash, plain echo works on the default shell', async () => {
    const command =
      os.platform() === 'win32'
        ? 'Write-Output "powershell-echo"'
        : 'echo native-echo';
    const expected =
      os.platform() === 'win32' ? 'powershell-echo' : 'native-echo';

    const { output, exitCode } = await runCmd(command, {
      enableWindowsBash: false,
    });
    expect(exitCode).toBe(0);
    expect(output).toContain(expected);
  });
});
