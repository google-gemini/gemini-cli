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

  it('should respect policies in ~/.gemini/policies/allowed-tools.toml', async () => {
    rig.setup('user-policy-test', {
      fakeResponsesPath: join(import.meta.dirname, 'user-policy.responses'),
    });

    // Create ~/.gemini/policies/allowed-tools.toml
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
    const result = await rig.run({
      args: ['-p', 'Run ls -F', '--model', 'gemini-3.1-pro-preview'],
      approvalMode: 'default',
    });

    expect(result).toContain('I ran ls -F');
    expect(result).not.toContain('Tool execution denied by policy');
    expect(result).not.toContain('Tool "run_shell_command" not found');

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
    const result = await rig.run({
      args: ['-p', 'Run ls -F', '--model', 'gemini-3.1-pro-preview'],
      approvalMode: 'default',
    });

    // In non-interactive mode, it should be denied
    expect(result).toContain('Tool "run_shell_command" not found');
  });
});
