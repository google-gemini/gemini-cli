/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GEMINI_DIR, TestRig, checkModelOutputContent } from './test-helper.js';

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
          general: {
            plan: { enabled: true },
          },
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

    const result = await rig.run({
      approvalMode: 'plan',
      args: 'Please list the files in the current directory, and then attempt to create a new file named "denied.txt" using a shell command.',
    });

    const toolLogs = rig.readToolLogs();
    const lsLog = toolLogs.find((l) => l.toolRequest.name === 'list_directory');
    const shellLog = toolLogs.find(
      (l) => l.toolRequest.name === 'run_shell_command',
    );

    expect(lsLog, 'Expected list_directory to be called').toBeDefined();
    expect(lsLog?.toolRequest.success).toBe(true);
    expect(
      shellLog,
      'Expected run_shell_command to be blocked (not even called)',
    ).toBeUndefined();

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
        tools: {
          core: ['write_file', 'read_file', 'list_directory'],
        },
        general: {
          plan: { enabled: true, directory: plansDir },
          defaultApprovalMode: 'plan',
        },
      },
    });

    await rig.run({
      approvalMode: 'plan',
      args: 'Create a file called plan.md in the plans directory.',
    });

    const toolLogs = rig.readToolLogs();
    const planWrite = toolLogs.find(
      (l) =>
        l.toolRequest.name === 'write_file' &&
        l.toolRequest.args.includes('plans') &&
        l.toolRequest.args.includes('plan.md'),
    );

    if (!planWrite) {
      console.error(
        'All tool calls found:',
        toolLogs.map((l) => ({
          name: l.toolRequest.name,
          args: l.toolRequest.args,
        })),
      );
    }

    expect(
      planWrite,
      'Expected write_file to be called for plan.md',
    ).toBeDefined();
    expect(
      planWrite?.toolRequest.success,
      `Expected write_file to succeed, but it failed with error: ${'error' in (planWrite?.toolRequest || {}) ? (planWrite?.toolRequest as unknown as Record<string, string>)['error'] : 'unknown'}`,
    ).toBe(true);
  });

  it('should deny write_file to non-plans directory in plan mode', async () => {
    const plansDir = '.gemini/tmp/foo/123/plans';
    const testName =
      'should deny write_file to non-plans directory in plan mode';

    await rig.setup(testName, {
      settings: {
        tools: {
          core: ['write_file', 'read_file', 'list_directory'],
        },
        general: {
          plan: { enabled: true, directory: plansDir },
          defaultApprovalMode: 'plan',
        },
      },
    });

    await rig.run({
      approvalMode: 'plan',
      args: 'Attempt to create a file named "hello.txt" in the current directory. Do not create a plan file, try to write hello.txt directly.',
    });

    const toolLogs = rig.readToolLogs();
    const writeLog = toolLogs.find(
      (l) =>
        l.toolRequest.name === 'write_file' &&
        l.toolRequest.args.includes('hello.txt'),
    );

    if (writeLog) {
      expect(
        writeLog.toolRequest.success,
        'Expected write_file to non-plans dir to fail',
      ).toBe(false);
    }
  });

  it('should be able to enter plan mode from default mode', async () => {
    await rig.setup('should be able to enter plan mode from default mode', {
      settings: {
        general: {
          plan: { enabled: true },
        },
        tools: {
          core: ['enter_plan_mode'],
          allowed: ['enter_plan_mode'],
        },
      },
    });

    await rig.run({
      approvalMode: 'default',
      args: 'I want to perform a complex refactoring. Please enter plan mode so we can design it first.',
    });

    const toolLogs = rig.readToolLogs();
    const enterLog = toolLogs.find(
      (l) => l.toolRequest.name === 'enter_plan_mode',
    );
    expect(enterLog, 'Expected enter_plan_mode to be called').toBeDefined();
    expect(enterLog?.toolRequest.success).toBe(true);
  });

  it('should allow write_file to the plans directory in plan mode even without a session ID', async () => {
    const plansDir = '.gemini/tmp/foo/plans';
    const testName =
      'should allow write_file to the plans directory in plan mode even without a session ID';

    await rig.setup(testName, {
      settings: {
        tools: {
          core: ['write_file', 'read_file', 'list_directory'],
        },
        general: {
          plan: { enabled: true, directory: plansDir },
          defaultApprovalMode: 'plan',
        },
      },
    });

    await rig.run({
      approvalMode: 'plan',
      args: 'Create a file called plan-no-session.md in the plans directory.',
    });

    const toolLogs = rig.readToolLogs();
    const planWrite = toolLogs.find(
      (l) =>
        l.toolRequest.name === 'write_file' &&
        l.toolRequest.args.includes('plans') &&
        l.toolRequest.args.includes('plan-no-session.md'),
    );

    if (!planWrite) {
      console.error(
        'All tool calls found:',
        toolLogs.map((l) => ({
          name: l.toolRequest.name,
          args: l.toolRequest.args,
        })),
      );
    }

    expect(
      planWrite,
      'Expected write_file to be called for plan-no-session.md',
    ).toBeDefined();
    expect(
      planWrite?.toolRequest.success,
      `Expected write_file to succeed, but it failed with error: ${'error' in (planWrite?.toolRequest || {}) ? (planWrite?.toolRequest as unknown as Record<string, string>)['error'] : 'unknown'}`,
    ).toBe(true);
  });
  it('should switch from a pro model to a flash model after exiting plan mode', async () => {
    const plansDir = 'plans-folder';
    const planFilename = 'my-plan.md';

    await rig.setup('should-switch-to-flash', {
      settings: {
        model: {
          name: 'auto-gemini-2.5',
        },
        experimental: { plan: true },
        tools: {
          core: ['exit_plan_mode', 'run_shell_command'],
          allowed: ['exit_plan_mode', 'run_shell_command'],
        },
        general: {
          defaultApprovalMode: 'plan',
          plan: {
            directory: plansDir,
          },
        },
      },
    });

    writeFileSync(
      join(rig.homeDir!, GEMINI_DIR, 'state.json'),
      JSON.stringify({ terminalSetupPromptShown: true }, null, 2),
    );

    const fullPlansDir = join(rig.testDir!, plansDir);
    mkdirSync(fullPlansDir, { recursive: true });
    writeFileSync(join(fullPlansDir, planFilename), 'Execute echo hello');

    await rig.run({
      approvalMode: 'plan',
      stdin: `Exit plan mode using ${planFilename} and then run a shell command \`echo hello\`.`,
    });

    const exitCallFound = await rig.waitForToolCall('exit_plan_mode');
    expect(exitCallFound, 'Expected exit_plan_mode to be called').toBe(true);

    const shellCallFound = await rig.waitForToolCall('run_shell_command');
    expect(shellCallFound, 'Expected run_shell_command to be called').toBe(
      true,
    );

    const apiRequests = rig.readAllApiRequest();
    const modelNames = apiRequests.map(
      (r) =>
        ('model' in (r.attributes || {})
          ? (r.attributes as unknown as Record<string, string>)['model']
          : 'unknown') || 'unknown',
    );

    const proRequests = apiRequests.filter((r) =>
      ('model' in (r.attributes || {})
        ? (r.attributes as unknown as Record<string, string>)['model']
        : 'unknown'
      )?.includes('pro'),
    );
    const flashRequests = apiRequests.filter((r) =>
      ('model' in (r.attributes || {})
        ? (r.attributes as unknown as Record<string, string>)['model']
        : 'unknown'
      )?.includes('flash'),
    );

    expect(
      proRequests.length,
      `Expected at least one Pro request. Models used: ${modelNames.join(', ')}`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      flashRequests.length,
      `Expected at least one Flash request after mode switch. Models used: ${modelNames.join(', ')}`,
    ).toBeGreaterThanOrEqual(1);
  });
});
