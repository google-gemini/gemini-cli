/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Background Shell Output Logging', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should log background process output to a file', async () => {
    await rig.setup('should log background process output to a file', {
      settings: { tools: { core: ['run_shell_command'] } },
    });

    // We use a command that outputs something, then backgrounds, then outputs more.
    // Since we're in the test rig, we have to be careful with how we background.
    // The run_shell_command tool backgrounds if is_background: true is passed.

    const prompt = `Please run the command "echo start && sleep 1 && echo end" in the background and tell me the PID.`;

    const result = await rig.run({
      args: [prompt],
      // approvalMode: 'yolo' is needed to avoid interactive prompt in tests
      approvalMode: 'yolo',
    });

    // Extract PID from result
    const cleanResult = result.replace(
      // eslint-disable-next-line no-control-regex
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      '',
    );
    const pidMatch = cleanResult.match(/PID.*?\s*(\d+)/i);
    expect(pidMatch, `Expected PID in output: ${cleanResult}`).toBeTruthy();
    const pid = parseInt(pidMatch![1], 10);

    const logDir = path.join(
      rig.homeDir!,
      '.gemini',
      'tmp',
      'background-processes',
    );
    const logFilePath = path.join(logDir, `background-${pid}.log`);

    // Wait for the process to finish and log output
    // We'll poll the log file
    let logContent = '';
    const maxRetries = 40;
    let retries = 0;

    while (retries < maxRetries) {
      if (fs.existsSync(logFilePath)) {
        logContent = fs.readFileSync(logFilePath, 'utf8');
        if (logContent.includes('end')) {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      retries++;
    }

    expect(logContent).toContain('start');
    expect(logContent).toContain('end');

    // Verify no ANSI escape codes are present (starting with \x1b[ or \u001b[)
    const ansiRegex =
      // eslint-disable-next-line no-control-regex
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    expect(logContent).not.toMatch(ansiRegex);

    // Cleanup the log file after test
    if (fs.existsSync(logFilePath)) {
      fs.unlinkSync(logFilePath);
    }
  });
});
