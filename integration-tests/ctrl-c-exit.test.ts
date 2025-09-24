/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
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
    ptyProcess.write('\x03');

    const timeout = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Test timed out: process did not exit within 10000ms. Output: ${output}`,
            ),
          ),
        10000,
      ),
    );

    const result = await Promise.race([promise, timeout]);

    // Expect a graceful exit (code 0)
    expect(
      result.exitCode,
      `Process exited with code ${result.exitCode}. Output: ${result.output}`,
    ).toBe(0);

    // Check that the quitting message is displayed
    const quittingMessage = 'Agent powering down. Goodbye!';
    // The regex below is intentionally matching the ESC control character (\x1b)
    // to strip ANSI color codes from the terminal output.
    // eslint-disable-next-line no-control-regex
    const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
    expect(cleanOutput).toContain(quittingMessage);
  });

  it('should not hang and eventually exit if Ctrl+C is sent multiple times', async () => {
    const rig = new TestRig();
    await rig.setup(
      'should not hang and eventually exit if Ctrl+C is sent multiple times',
    );

    const { ptyProcess, promise } = rig.runInteractive();

    let output = '';
    ptyProcess.onData((data) => {
      output += data;
    });

    // Wait for the app to be ready by looking for the initial prompt indicator
    await rig.poll(() => output.includes('▶'), 5000, 100);

    // Send multiple Ctrl+C signals to ensure exit
    ptyProcess.write('\x03');
    ptyProcess.write('\x03');
    ptyProcess.write('\x03');

    const timeout = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Test timed out: process did not exit within 10000ms. Output: ${output}`,
            ),
          ),
        10000,
      ),
    );

    // Race the process promise against a timeout.
    // If the process doesn't exit, the timeout will reject and fail the test.
    const result = await Promise.race([promise, timeout]);

    // We expect the process to have exited. The result object indicates this.
    expect(result).toBeDefined();
  });
});
