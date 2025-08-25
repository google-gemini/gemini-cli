/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ShellExecutionService } from '../packages/core/src/services/shellExecutionService.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { vi } from 'vitest';

describe('ShellExecutionService programmatic integration tests', () => {
  let testDir: string;

  beforeAll(async () => {
    // Create a dedicated directory for this test suite to avoid conflicts.
    testDir = path.join(
      process.env['INTEGRATION_TEST_FILE_DIR']!,
      'shell-service-tests',
    );
    await fs.mkdir(testDir, { recursive: true });
  });

  it('should execute a simple cross-platform command (echo)', async () => {
    const command = 'echo "hello from the service"';
    const onOutputEvent = vi.fn();
    const abortController = new AbortController();

    const handle = await ShellExecutionService.execute(
      command,
      testDir,
      onOutputEvent,
      abortController.signal,
      false,
    );

    const result = await handle.result;

    expect(result.error).toBeNull();
    expect(result.exitCode).toBe(0);
    // Output can vary slightly between shells (e.g., quotes), so check for inclusion.
    expect(result.output).toContain('hello from the service');
  });

  it.runIf(process.platform === 'win32')(
    'should execute "dir" on Windows',
    async () => {
      const testFile = 'test-file-windows.txt';
      await fs.writeFile(path.join(testDir, testFile), 'windows test');

      const command = 'dir';
      const onOutputEvent = vi.fn();
      const abortController = new AbortController();

      const handle = await ShellExecutionService.execute(
        command,
        testDir,
        onOutputEvent,
        abortController.signal,
        false,
      );

      const result = await handle.result;

      expect(result.error).toBeNull();
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(testFile);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'should execute "ls -l" on Unix',
    async () => {
      const testFile = 'test-file-unix.txt';
      await fs.writeFile(path.join(testDir, testFile), 'unix test');

      const command = 'ls -l';
      const onOutputEvent = vi.fn();
      const abortController = new AbortController();

      const handle = await ShellExecutionService.execute(
        command,
        testDir,
        onOutputEvent,
        abortController.signal,
        false,
      );

      const result = await handle.result;

      expect(result.error).toBeNull();
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(testFile);
    },
  );

  it('should abort a running process', async () => {
    // A command that runs for a bit. 'sleep' on unix, 'timeout' on windows.
    const command = process.platform === 'win32' ? 'timeout /t 20' : 'sleep 20';
    const onOutputEvent = vi.fn();
    const abortController = new AbortController();

    const handle = await ShellExecutionService.execute(
      command,
      testDir,
      onOutputEvent,
      abortController.signal,
      false,
    );

    // Abort shortly after starting
    setTimeout(() => abortController.abort(), 50);

    const result = await handle.result;

    // For debugging the flaky test.
    console.log('Abort test result:', result);

    expect(result.aborted).toBe(true);
    // A clean exit is exitCode 0 and no signal. If the process was truly
    // aborted, it should not have exited cleanly.
    const exitedCleanly = result.exitCode === 0 && result.signal === null;
    expect(exitedCleanly, 'Process should not have exited cleanly').toBe(false);
  });

  it('should propagate environment variables to the child process', async () => {
    const varName = 'GEMINI_CLI_TEST_VAR';
    const varValue = `test-value`;
    process.env[varName] = varValue;

    try {
      const command =
        process.platform === 'win32' ? `echo %${varName}%` : `echo $${varName}`;
      const onOutputEvent = vi.fn();
      const abortController = new AbortController();

      const handle = await ShellExecutionService.execute(
        command,
        testDir,
        onOutputEvent,
        abortController.signal,
        false,
      );

      const result = await handle.result;

      expect(result.error).toBeNull();
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(varValue);
    } finally {
      // Clean up the env var to prevent side-effects on other tests.
      delete process.env[varName];
    }
  });
});
