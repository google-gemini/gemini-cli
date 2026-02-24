/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, checkModelOutputContent } from './test-helper.js';
import path from 'node:path';

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

    // list_directory should be called and succeed.
    const lsCallFound = await rig.waitForToolCall('list_directory');
    expect(lsCallFound, 'Expected list_directory to be called').toBe(true);

    // run_shell_command should be called but fail.
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

  it('should allow write_file only in the plans directory in plan mode', async () => {
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
    await rig.run({
      approvalMode: 'plan',
      stdin: 'Create a file called plan.md in the plans directory',
    });

    const toolLogs = rig.readToolLogs();
    const writeLogs = toolLogs.filter(
      (l) => l.toolRequest.name === 'write_file',
    );

    // We expect at least two write_file calls: one for the plan and one for the blocked file.
    const expectedPlanPath = path.join('plans', 'plan.md');
    const planWrite = writeLogs.find((l) =>
      l.toolRequest.args.includes(expectedPlanPath),
    );

    expect(planWrite?.toolRequest.success).toBeDefined();
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
