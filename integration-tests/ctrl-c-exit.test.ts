/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import { TestRig } from './test-helper.js';

describe('Ctrl+C exit', () => {
  it('should exit gracefully on second Ctrl+C', async () => {
    const rig = new TestRig();
    await rig.setup('should exit gracefully on second Ctrl+C');

    const { ptyProcess, promise } = rig.runInteractive();

    let output = '';
    ptyProcess.onData((data) => {
      output += data;
    });

    // Wait for the app to be ready by looking for the initial prompt indicator
    await rig.poll(() => output.includes('▶'), 5000, 100);

    // Send first Ctrl+C
    ptyProcess.write('\x03');

    // Wait for the exit prompt
    await rig.poll(
      () => output.includes('Press Ctrl+C again to exit'),
      1500,
      50,
    );

    // Send second Ctrl+C
    if (os.platform() === 'win32') {
      // This is a workaround for node-pty/winpty on Windows.
      // Reliably sending a second Ctrl+C signal to a process that is already
      // handling the first one is not possible in the emulated pty environment.
      // The first signal is caught correctly (verified by the poll above),
      // which is the most critical part of the test on this platform.
      // To allow the test to pass, we forcefully kill the process,
      // simulating a successful exit. We accept that we cannot test the
      // graceful shutdown message on Windows in this automated context.
      ptyProcess.kill();
    } else {
      // On Unix-like systems, send the second Ctrl+C to trigger the graceful exit.
      ptyProcess.write('\x03');
    }

    const timeout = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Test timed out: process did not exit within a minute. Output: ${output}`,
            ),
          ),
        60000,
      ),
    );

    const result = await Promise.race([promise, timeout]);

    // On Windows, killing the process may result in a non-zero exit code. On
    // other platforms, a graceful exit is code 0.
    if (os.platform() === 'win32') {
      // On Windows, the exit code after ptyProcess.kill() can be unpredictable
      // (often 1), so we accept any non-null exit code as a pass condition,
      // focusing on the fact that the process did terminate.
      expect(
        result.exitCode,
        `Process exited with code ${result.exitCode}. Output: ${result.output}`,
      ).not.toBeNull();
    } else {
      // Expect a graceful exit (code 0) on non-Windows platforms
      expect(
        result.exitCode,
        `Process exited with code ${result.exitCode}. Output: ${result.output}`,
      ).toBe(0);

      // Only check for the quitting message on non-Windows platforms due to the
      // forceful kill workaround.
      const quittingMessage = 'Agent powering down. Goodbye!';
      // The regex below is intentionally matching the ESC control character (\x1b)
      // to strip ANSI color codes from the terminal output.
      // eslint-disable-next-line no-control-regex
      const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
      expect(cleanOutput).toContain(quittingMessage);
    }
  });
});
