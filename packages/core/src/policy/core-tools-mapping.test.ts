/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { createPolicyEngineConfig } from './config.js';
import { PolicyEngine } from './policy-engine.js';
import { PolicyDecision, ApprovalMode } from './types.js';

describe('PolicyEngine - Core Tools Mapping', () => {
  it('should allow tools explicitly listed in settings.tools.core', async () => {
    const settings = {
      tools: {
        core: ['run_shell_command(ls)', 'run_shell_command(git status)'],
      },
    };

    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
      undefined,
      true, // interactive
    );

    const engine = new PolicyEngine(config);

    // Test simple tool name
    const result1 = await engine.check(
      { name: 'run_shell_command', args: { command: 'ls' } },
      undefined,
    );
    expect(result1.decision).toBe(PolicyDecision.ALLOW);

    // Test tool name with args
    const result2 = await engine.check(
      { name: 'run_shell_command', args: { command: 'git status' } },
      undefined,
    );
    expect(result2.decision).toBe(PolicyDecision.ALLOW);

    // Test tool not in core list
    const result3 = await engine.check(
      { name: 'run_shell_command', args: { command: 'npm test' } },
      undefined,
    );
    // Should be DENIED because of strict allowlist
    expect(result3.decision).toBe(PolicyDecision.DENY);
  });

  it('should allow tools in tools.core even if they are restricted by default policies', async () => {
    // By default run_shell_command is ASK_USER.
    // Putting it in tools.core should make it ALLOW.
    const settings = {
      tools: {
        core: ['run_shell_command'],
      },
    };

    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
      undefined,
      true,
    );

    const engine = new PolicyEngine(config);

    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'any command' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });
});
