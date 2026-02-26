/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, checkModelOutputContent } from './test-helper.js';

describe('Plan Mode', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should allow read-only tools but deny write tools in plan mode', async () => {
    await rig.setup(
      'should allow read-only tools but deny write tools in plan mode',
      {
        settings: {
          experimental: { plan: true },
          tools: {
            core: [
              'run_shell_command',
              'list_directory',
              'write_file',
              'read_file',
            ],
          },
        },
      },
    );

    // We use a prompt that asks for both a read-only action and a write action.
    // "List files" (read-only) followed by "touch denied.txt" (write).
    const result = await rig.run({
      approvalMode: 'plan',
      stdin:
        'Please list the files in the current directory, and then attempt to create a new file named "denied.txt" using a shell command.',
    });

    const lsCallFound = await rig.waitForToolCall('list_directory');
    expect(lsCallFound, 'Expected list_directory to be called').toBe(true);

    const shellCallFound = await rig.waitForToolCall('run_shell_command');
    expect(shellCallFound, 'Expected run_shell_command to fail').toBe(false);

    const toolLogs = rig.readToolLogs();
    const lsLog = toolLogs.find((l) => l.toolRequest.name === 'list_directory');
    expect(
      toolLogs.find((l) => l.toolRequest.name === 'run_shell_command'),
    ).toBeUndefined();

    expect(lsLog?.toolRequest.success).toBe(true);

    checkModelOutputContent(result, {
      expectedContent: ['Plan Mode', 'read-only'],
      testName: 'Plan Mode restrictions test',
    });
  });

  it.skip('should allow write_file only in the plans directory in plan mode', async () => {
    await rig.setup(
      'should allow write_file only in the plans directory in plan mode',
      {
        settings: {
          experimental: { plan: true },
          tools: {
            core: ['write_file', 'read_file', 'list_directory'],
            allowed: ['write_file'],
          },
          general: { defaultApprovalMode: 'plan' },
        },
      },
    );

    // We ask the agent to create a plan for a feature, which should trigger a write_file in the plans directory.
    // Verify that write_file outside of plan directory fails
    await rig.run({
      approvalMode: 'plan',
      stdin:
        'Create a file called plan.md in the plans directory. Then create a file called hello.txt in the current directory',
    });

    const toolLogs = rig.readToolLogs();
    const writeLogs = toolLogs.filter(
      (l) => l.toolRequest.name === 'write_file',
    );

    const planWrite = writeLogs.find(
      (l) =>
        l.toolRequest.args.includes('plans') &&
        l.toolRequest.args.includes('plan.md'),
    );

    const blockedWrite = writeLogs.find((l) =>
      l.toolRequest.args.includes('hello.txt'),
    );

    // Model is undeterministic, sometimes a blocked write appears in tool logs and sometimes it doesn't
    if (blockedWrite) {
      expect(blockedWrite?.toolRequest.success).toBe(false);
    }

    expect(planWrite?.toolRequest.success).toBe(true);
  });

  it('should be able to enter plan mode from default mode', async () => {
    await rig.setup('should be able to enter plan mode from default mode', {
      settings: {
        experimental: { plan: true },
        tools: {
          core: ['enter_plan_mode'],
          allowed: ['enter_plan_mode'],
        },
      },
    });

    // Start in default mode and ask to enter plan mode.
    await rig.run({
      approvalMode: 'default',
      stdin:
        'I want to perform a complex refactoring. Please enter plan mode so we can design it first.',
    });

    const enterPlanCallFound = await rig.waitForToolCall(
      'enter_plan_mode',
      10000,
    );
    expect(enterPlanCallFound, 'Expected enter_plan_mode to be called').toBe(
      true,
    );

    const toolLogs = rig.readToolLogs();
    const enterLog = toolLogs.find(
      (l) => l.toolRequest.name === 'enter_plan_mode',
    );
    expect(enterLog?.toolRequest.success).toBe(true);
  });
});
