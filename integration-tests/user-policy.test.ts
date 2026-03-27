/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { TestRig, GEMINI_DIR } from './test-helper.js';
import fs from 'node:fs';

describe('User Policy Regression Repro', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  it('should respect policies in the selected user config directory', async () => {
    rig.setup('user-policy-test', {
      fakeResponsesPath: join(import.meta.dirname, 'user-policy.responses'),
    });

    // Create the policy file in the selected user config directory.
    const userPoliciesDir = join(rig.homeDir!, GEMINI_DIR, 'policies');
    fs.mkdirSync(userPoliciesDir, { recursive: true });
    fs.writeFileSync(
      join(userPoliciesDir, 'allowed-tools.toml'),
      `
[[rule]]
toolName = "run_shell_command"
commandPrefix = "ls -F"
decision = "allow"
priority = 100
      `,
    );

    // Run gemini with a prompt that triggers ls -F
    // approvalMode: 'default' in headless mode will DENY if it hits ASK_USER
    await rig.run({
      args: ['-p', 'Run ls -F', '--model', 'gemini-3.1-pro-preview'],
      approvalMode: 'default',
    });

    const toolLogs = rig.readToolLogs();
    const lsLog = toolLogs.find(
      (l) =>
        l.toolRequest.name === 'run_shell_command' &&
        l.toolRequest.args.includes('ls -F'),
    );
    expect(lsLog).toBeDefined();
    expect(lsLog?.toolRequest.success).toBe(true);
  });

  it('should FAIL if policy is not present (sanity check)', async () => {
    rig.setup('user-policy-sanity-check', {
      fakeResponsesPath: join(import.meta.dirname, 'user-policy.responses'),
    });

    // DO NOT create the policy file here

    // Run gemini with a prompt that triggers ls -F
    await rig.run({
      args: ['-p', 'Run ls -F', '--model', 'gemini-3.1-pro-preview'],
      approvalMode: 'default',
    });

    const toolLogs = rig.readToolLogs();
    const lsLog = toolLogs.find(
      (l) =>
        l.toolRequest.name === 'run_shell_command' &&
        l.toolRequest.args.includes('ls -F'),
    );
    expect(lsLog).toBeDefined();
    expect(lsLog?.toolRequest.success).toBe(false);
  });
});
