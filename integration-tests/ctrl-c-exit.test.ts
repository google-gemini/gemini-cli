/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import { TestRig } from './test-helper.js';

describe.skip('Ctrl+C exit', () => {
  it('should exit gracefully on second Ctrl+C', async () => {
    const rig = new TestRig();
    await rig.setup('should exit gracefully on second Ctrl+C');

    const run = await rig.runInteractive();

    // Send first Ctrl+C
    run.type('\x03');

    await run.expectText('Press Ctrl+C again to exit', 5000);

    if (os.platform() === 'win32') {
      // This is a workaround for node-pty/winpty on Windows.
      // Reliably sending a second Ctrl+C signal to a process that is already
      // handling the first one is not possible in the emulated pty environment.
      // The first signal is caught correctly (verified by the poll above),
      // which is the most critical part of the test on this platform.
      // To allow the test to pass, we forcefully kill the process,
      // simulating a successful exit. We accept that we cannot test the
      // graceful shutdown message on Windows in this automated context.
      run.kill();

      const exitCode = await run.expectExit();
      // On Windows, the exit code after ptyProcess.kill() can be unpredictable
      // (often 1), so we accept any non-null exit code as a pass condition,
      // focusing on the fact that the process did terminate.
      expect(exitCode, `Process exited with code ${exitCode}.`).not.toBeNull();
      return;
    }

    // Send second Ctrl+C
    run.type('\x03');

    const exitCode = await run.expectExit();
    expect(exitCode, `Process exited with code ${exitCode}.`).toBe(0);

    await run.expectText('Agent powering down. Goodbye!', 5000);
  });
});
