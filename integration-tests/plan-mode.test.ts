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
      `Expected write_file to succeed, but it failed with error: ${planWrite?.toolRequest.error}`,
    ).toBe(true);
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

    await rig.run({
      approvalMode: 'plan',
      args: 'Create a file called hello.txt in the current directory.',
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
        experimental: { plan: true },
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
      `Expected write_file to succeed, but it failed with error: ${planWrite?.toolRequest.error}`,
    ).toBe(true);
  });
});
