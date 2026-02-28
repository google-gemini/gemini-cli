/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { TestRig } from './test-helper.js';

interface PromptCommand {
  prompt: (testFile: string) => string;
  tool: string;
  command: string;
  expectedSuccessResult: string;
  expectedFailureResult: string;
}

const ECHO_PROMPT: PromptCommand = {
  command: 'echo',
  prompt: () =>
    `Use the \`echo POLICY_TEST_ECHO_COMMAND\` shell command. On success, ` +
    `your final response must ONLY be "POLICY_TEST_ECHO_COMMAND". If the ` +
    `command fails output AR NAR and stop.`,
  tool: 'run_shell_command',
  expectedSuccessResult: 'POLICY_TEST_ECHO_COMMAND',
  expectedFailureResult: 'AR NAR',
};

const READ_FILE_PROMPT: PromptCommand = {
  prompt: (testFile: string) =>
    `Read the file ${testFile} and tell me what language it is, if the ` +
    `read_file tool fails output AR NAR and stop.`,
  tool: 'read_file',
  command: '',
  expectedSuccessResult: 'Latin',
  expectedFailureResult: 'AR NAR',
};

async function waitForToolCallLog(
  rig: TestRig,
  tool: string,
  command: string,
  timeout: number = 15000,
) {
  const foundToolCall = await rig.waitForToolCall(tool, timeout, (args) =>
    args.toLowerCase().includes(command.toLowerCase()),
  );

  expect(foundToolCall).toBe(true);

  const toolLogs = rig
    .readToolLogs()
    .filter((toolLog) => toolLog.toolRequest.name === tool);
  const log = toolLogs.find(
    (toolLog) =>
      !command ||
      toolLog.toolRequest.args.toLowerCase().includes(command.toLowerCase()),
  );

  // The policy engine should have logged the tool call
  expect(log).toBeTruthy();
  return log;
}

async function verifyToolExecution(
  rig: TestRig,
  promptCommand: PromptCommand,
  result: string,
  expectAllowed: boolean,
) {
  const log = await waitForToolCallLog(
    rig,
    promptCommand.tool,
    promptCommand.command,
  );

  if (expectAllowed) {
    expect(log!.toolRequest.success).toBe(true);
    expect(result).not.toContain('Tool execution denied by policy');
    expect(result).toContain(promptCommand.expectedSuccessResult);
  } else {
    expect(log!.toolRequest.success).toBe(false);
    expect(result).toContain('Tool execution denied by policy');
    expect(result).toContain(promptCommand.expectedFailureResult);
  }
}

interface TestCase {
  name: string;
  responsesFile: string;
  promptCommand: PromptCommand;
  policyContent?: string;
  expectAllowed: boolean;
}

describe('Policy Engine Headless Mode', () => {
  let rig: TestRig;
  let testFile: string;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  const runTestCase = async (tc: TestCase) => {
    const fakeResponsesPath = join(import.meta.dirname, tc.responsesFile);
    rig.setup(tc.name, { fakeResponsesPath });

    testFile = rig.createFile('test.txt', 'Lorem\nIpsum\nDolor\n');
    const args = ['-p', tc.promptCommand.prompt(testFile)];

    if (tc.policyContent) {
      const policyPath = rig.createFile('test-policy.toml', tc.policyContent);
      args.push('--policy', policyPath);
    }

    const result = await rig.run({
      args,
      approvalMode: 'default',
    });

    await verifyToolExecution(rig, tc.promptCommand, result, tc.expectAllowed);
  };

  const testCases = [
    {
      name: 'should deny ASK_USER tools by default in headless mode',
      responsesFile: 'policy-headless-shell-denied.responses',
      promptCommand: ECHO_PROMPT,
      expectAllowed: false,
    },
    {
      name: 'should allow ASK_USER tools in headless mode if explicitly allowed via policy file',
      responsesFile: 'policy-headless-shell-allowed.responses',
      promptCommand: ECHO_PROMPT,
      policyContent: `
      [[rule]]
      toolName = "run_shell_command"
      decision = "allow"
      priority = 100
    `,
      expectAllowed: true,
    },
    {
      name: 'should allow read-only tools by default in headless mode',
      responsesFile: 'policy-headless-readonly.responses',
      promptCommand: READ_FILE_PROMPT,
      expectAllowed: true,
    },
    {
      name: 'should allow specific shell commands in policy file',
      responsesFile: 'policy-headless-shell-allowed.responses',
      promptCommand: ECHO_PROMPT,
      policyContent: `
        [[rule]]
        toolName = "run_shell_command"
        commandPrefix = "${ECHO_PROMPT.command}"
        decision = "allow"
        priority = 100
      `,
      expectAllowed: true,
    },
    {
      name: 'should deny other shell commands in policy file',
      responsesFile: 'policy-headless-shell-denied.responses',
      promptCommand: ECHO_PROMPT,
      policyContent: `
        [[rule]]
        toolName = "run_shell_command"
        commandPrefix = "node"
        decision = "allow"
        priority = 100
      `,
      expectAllowed: false,
    },
  ];

  it.each(testCases)(
    '$name',
    async (tc) => {
      await runTestCase(tc);
    },
    // Large timeout for regeneration
    process.env['REGENERATE_MODEL_GOLDENS'] === 'true' ? 120000 : undefined,
  );
});
