/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, poll } from './test-helper.js';
import { join } from 'node:path';

describe('Hooks System - Pending Tool Calls', () => {
  let rig: TestRig;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'dummy';
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  it('should report has_pending_tool_calls=true when tool call is generated', async () => {
    // Use existing responses that include a tool call
    // This response file contains:
    // 1. A response with a tool call (write_file)
    // 2. A final response confirming the file creation
    const responsesPath = join(
      import.meta.dirname,
      'hooks-pending-tools.responses',
    );

    await rig.setup('should report has_pending_tool_calls=true', {
      fakeResponsesPath: responsesPath,
      settings: {
        tools: {
          enableHooks: true,
        },
        hooks: {
          AfterAgent: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'echo \'{"decision": "allow"}\'',
                  timeout: 5000,
                },
              ],
            },
          ],
        },
      },
    });

    const prompt =
      'Create a file called approved.txt with content "Approved content"';
    await rig.run(prompt);

    // Wait for logs to be populated
    await poll(
      () => {
        const logs = rig.readHookLogs();
        const count = logs.filter(
          (l) => l.hookCall.hook_event_name === 'AfterAgent',
        ).length;
        return count >= 2;
      },
      10000,
      100,
    );

    const hookLogs = rig.readHookLogs();
    const afterAgentLogs = hookLogs.filter(
      (l) => l.hookCall.hook_event_name === 'AfterAgent',
    );

    // We expect at least two AfterAgent calls:
    // 1. After model generates tool call (has_pending_tool_calls = true)
    // 2. After model generates final response (has_pending_tool_calls = false)

    expect(afterAgentLogs.length).toBeGreaterThanOrEqual(2);

    // Check the one with tool call
    const pendingLog = afterAgentLogs.find((l) => {
      const input =
        typeof l.hookCall.hook_input === 'string'
          ? JSON.parse(l.hookCall.hook_input)
          : l.hookCall.hook_input;
      return input.has_pending_tool_calls === true;
    });
    expect(pendingLog).toBeDefined();

    // Check the one without tool call
    const doneLog = afterAgentLogs.find((l) => {
      const input =
        typeof l.hookCall.hook_input === 'string'
          ? JSON.parse(l.hookCall.hook_input)
          : l.hookCall.hook_input;
      return input.has_pending_tool_calls === false;
    });
    expect(doneLog).toBeDefined();
  });
});
