/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeAll } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { PolicyDecision } from './types.js';
import { initializeShellParsers } from '../utils/shell-utils.js';

describe('PolicyEngine Command Substitution Validation', () => {
  beforeAll(async () => {
    await initializeShellParsers();
  });

  const setupEngine = (blockedCmd: string) =>
    new PolicyEngine({
      defaultDecision: PolicyDecision.ALLOW,
      rules: [
        {
          toolName: 'run_shell_command',
          argsPattern: new RegExp(`"command":"${blockedCmd}"`),
          decision: PolicyDecision.DENY,
        },
      ],
    });

  it('should block echo $(dangerous_cmd) when dangerous_cmd is explicitly blocked', async () => {
    const engine = setupEngine('dangerous_cmd');
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo $(dangerous_cmd)' } },
      'test-server',
    );
    expect(result.decision).toBe(PolicyDecision.DENY);
  });

  it('should block backtick substitution `dangerous_cmd`', async () => {
    const engine = setupEngine('dangerous_cmd');
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo `dangerous_cmd`' } },
      'test-server',
    );
    expect(result.decision).toBe(PolicyDecision.DENY);
  });

  it('should block commands inside subshells (dangerous_cmd)', async () => {
    const engine = setupEngine('dangerous_cmd');
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: '(dangerous_cmd)' } },
      'test-server',
    );
    expect(result.decision).toBe(PolicyDecision.DENY);
  });

  it('should handle nested substitutions deeply', async () => {
    const engine = setupEngine('deep_danger');
    const result = await engine.check(
      {
        name: 'run_shell_command',
        args: { command: 'echo $(ls $(deep_danger))' },
      },
      'test-server',
    );
    expect(result.decision).toBe(PolicyDecision.DENY);
  });
});
