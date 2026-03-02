/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, checkModelOutputContent, GEMINI_DIR } from './test-helper.js';

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

  it('should allow write_file to the plans directory in plan mode', async () => {
    const plansDir = '.gemini/tmp/foo/123/plans';
    const testName =
      'should allow write_file to the plans directory in plan mode';

    await rig.setup(testName, {
      settings: {
        experimental: { plan: true },
        tools: {
          core: ['write_file', 'read_file', 'list_directory'],
        },
        general: {
          defaultApprovalMode: 'plan',
          plan: {
            directory: plansDir,
          },
        },
      },
    });

    // Disable the interactive terminal setup prompt in tests
    writeFileSync(
      join(rig.homeDir!, GEMINI_DIR, 'state.json'),
      JSON.stringify({ terminalSetupPromptShown: true }, null, 2),
    );

    const run = await rig.runInteractive({
      approvalMode: 'plan',
    });

    await run.type('Create a file called plan.md in the plans directory.');
    await run.type('\r');

    await rig.expectToolCallSuccess(['write_file'], 30000, (args) =>
      args.includes('plan.md'),
    );

    const toolLogs = rig.readToolLogs();
    const planWrite = toolLogs.find(
      (l) =>
        l.toolRequest.name === 'write_file' &&
        l.toolRequest.args.includes('plans') &&
        l.toolRequest.args.includes('plan.md'),
    );
    expect(planWrite?.toolRequest.success).toBe(true);
  });

  it('should deny write_file to non-plans directory in plan mode', async () => {
    const plansDir = '.gemini/tmp/foo/123/plans';
    const testName =
      'should deny write_file to non-plans directory in plan mode';

    await rig.setup(testName, {
      settings: {
        experimental: { plan: true },
        tools: {
          core: ['write_file', 'read_file', 'list_directory'],
        },
        general: {
          defaultApprovalMode: 'plan',
          plan: {
            directory: plansDir,
          },
        },
      },
    });

    // Disable the interactive terminal setup prompt in tests
    writeFileSync(
      join(rig.homeDir!, GEMINI_DIR, 'state.json'),
      JSON.stringify({ terminalSetupPromptShown: true }, null, 2),
    );

    const run = await rig.runInteractive({
      approvalMode: 'plan',
    });

    await run.type('Create a file called hello.txt in the current directory.');
    await run.type('\r');

    const toolLogs = rig.readToolLogs();
    const writeLog = toolLogs.find(
      (l) =>
        l.toolRequest.name === 'write_file' &&
        l.toolRequest.args.includes('hello.txt'),
    );

    // In Plan Mode, writes outside the plans directory should be blocked.
    // Model is undeterministic, sometimes it doesn't even try, but if it does, it must fail.
    if (writeLog) {
      expect(writeLog.toolRequest.success).toBe(false);
    }
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

    // Disable the interactive terminal setup prompt in tests
    writeFileSync(
      join(rig.homeDir!, GEMINI_DIR, 'state.json'),
      JSON.stringify({ terminalSetupPromptShown: true }, null, 2),
    );

    // Start in default mode and ask to enter plan mode.
    await rig.run({
      approvalMode: 'default',
      stdin:
        'I want to perform a complex refactoring. Please enter plan mode so we can design it first.',
    });

    const enterPlanCallFound = await rig.waitForToolCall('enter_plan_mode');
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
