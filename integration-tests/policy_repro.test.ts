/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestRig, printDebugInfo } from './test-helper.js';
import * as path from 'node:path';

describe('Headless Policy Reproduction', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
    vi.stubEnv('GEMINI_API_KEY', 'fake-key');
  });

  afterEach(async () => {
    await rig.cleanup();
    vi.unstubAllEnvs();
  });

  it('should block tools that require ask_user confirmation in headless mode', async () => {
    // 1. Setup the rig with fake responses
    const responsesPath = path.resolve(__dirname, 'policy_repro.responses');
    await rig.setup(
      'should block tools that require ask_user confirmation in headless mode',
      {
        fakeResponsesPath: responsesPath,
        settings: {
          model: {
            name: 'gemini-1.5-pro',
          },
        },
      },
    );

    // 2. Create a policy file with ask_user for run_shell_command.
    // In headless/non-interactive mode, ask_user decisions must be converted to DENY,
    // preventing the tool from executing.
    const policyContent = `
[[rule]]
toolName = "run_shell_command"
decision = "ask_user"
priority = 999
    `;
    const policyPath = rig.createFile('ask-shell.toml', policyContent);
    const prompt = 'Run "echo policy-test-passed" and show me the output';

    const result = await rig.run({
      args: ['-p', prompt, '--policy', policyPath],
      env: {
        GEMINI_DEBUG: '1',
        VERBOSE: 'true',
      },
    });

    // 3. Wait for any tool call attempt (the tool will be attempted but should fail with error).
    // waitForToolCall returns true even for failed/errored calls.
    await rig.waitForToolCall('run_shell_command');

    // 4. Check the tool call was NOT successful.
    const toolLogs = rig.readToolLogs();
    const shellCommandLog = toolLogs.find(
      (log) => log.toolRequest.name === 'run_shell_command',
    );

    if (!shellCommandLog || shellCommandLog.toolRequest.success) {
      console.log('CLI Result:', result);
      printDebugInfo(rig, result, {
        'Tool log entry': shellCommandLog,
        'Policy path': policyPath,
        'Result contains blocked string': result.includes('policy-test-passed'),
      });
    }

    // The tool call should have been attempted but blocked (not successful).
    expect(
      shellCommandLog?.toolRequest.success,
      'Expected run_shell_command to be BLOCKED by policy in headless mode (success should be false)',
    ).toBe(false);

    // The actual command result should not appear in the output.
    expect(result).not.toContain('policy-test-passed');
  }, 30000);

  it('should treat global ask_user decisions as DENY in headless mode', async () => {
    // 1. Setup the rig with fake responses
    const responsesPath = path.resolve(__dirname, 'policy_repro.responses');
    await rig.setup(
      'should treat global ask_user decisions as DENY in headless mode',
      {
        fakeResponsesPath: responsesPath,
        settings: {
          model: {
            name: 'gemini-1.5-pro',
          },
        },
      },
    );

    // 2. Create a global policy file with ask_user.
    // In headless/non-interactive mode, ask_user decisions must be converted to DENY.
    const policyContent = `
[[rule]]
decision = "ask_user"
priority = 999
    `;
    const policyPath = rig.createFile('global-ask.toml', policyContent);
    const prompt = 'Run "echo global-test-passed" and show me the output';

    const result = await rig.run({
      args: ['-p', prompt, '--policy', policyPath],
      env: {
        GEMINI_DEBUG: '1',
        VERBOSE: 'true',
      },
    });

    // 3. Wait for any tool call attempt.
    await rig.waitForToolCall('run_shell_command');

    // 4. Check the tool call was NOT successful.
    const toolLogs = rig.readToolLogs();
    const shellCommandLog = toolLogs.find(
      (log) => log.toolRequest.name === 'run_shell_command',
    );

    if (!shellCommandLog || shellCommandLog.toolRequest.success) {
      console.log('CLI Result:', result);
      printDebugInfo(rig, result, {
        'Tool log entry': shellCommandLog,
        'Policy path': policyPath,
        'Result contains blocked string': result.includes('global-test-passed'),
      });
    }

    // The tool call should have been attempted but blocked (not successful).
    expect(
      shellCommandLog?.toolRequest.success,
      'Expected run_shell_command to be BLOCKED by global policy in headless mode (success should be false)',
    ).toBe(false);

    // The actual command result should not appear in the output.
    expect(result).not.toContain('global-test-passed');
  }, 30000);
});
