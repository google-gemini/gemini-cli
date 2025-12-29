/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach, beforeEach } from 'vitest';
import { TestRig } from './test-helper.js';

describe('Background Shell', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should background a running process and allow monitoring it', async () => {
    await rig.setup('background-shell-test', {
      settings: { tools: { core: ['run_shell_command'] } },
    });

    const run = await rig.runInteractive({
      yolo: true, // Auto-execute commands
    });

    // Run a command that takes some time
    // We use a long sleep to ensure we have time to background it
    const command = 'echo start-bg-test && sleep 3 && echo end-bg-test';
    await run.sendKeys(`run command "${command}"\n`);

    // Wait for the command to start executing and show output
    await run.expectText('start-bg-test');

    // Send Ctrl+B to background the process
    await run.sendText('\x02');

    // Wait a bit to ensure it's backgrounded and the prompt returns
    await run.expectText('Type your message');

    // Send Ctrl+B to toggle the background shell view
    await run.sendText('\x02');

    // Verify we see the background shell UI
    await run.expectText('PID:');

    // Verify the command is visible
    await run.expectText('sleep');

    // Wait for the process to finish
    await run.expectText('end-bg-test', 20000);
  }, 120000);
});
