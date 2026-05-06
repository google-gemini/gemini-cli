/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { PolicyDecision, ApprovalMode } from './types.js';
import { initializeShellParsers } from '../utils/shell-utils.js';
import { buildArgsPatterns } from './utils.js';

describe('PolicyEngine - Shell Safety Regression Suite', () => {
  let engine: PolicyEngine;

  beforeAll(async () => {
    await initializeShellParsers();
  });

  const setupEngine = (allowedCommands: string[]) => {
    const rules = allowedCommands.map((cmd) => ({
      toolName: 'run_shell_command',
      decision: PolicyDecision.ALLOW,
      argsPattern: new RegExp(buildArgsPatterns(undefined, cmd)[0]!),
      priority: 10,
    }));

    return new PolicyEngine({
      rules,
      approvalMode: ApprovalMode.DEFAULT,
      defaultDecision: PolicyDecision.ASK_USER,
    });
  };

  it('should block unauthorized chained command with &&', async () => {
    engine = setupEngine(['echo']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo hi && ls' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('should allow authorized chained command with &&', async () => {
    engine = setupEngine(['echo', 'ls']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo hi && ls' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should block unauthorized chained command with ||', async () => {
    engine = setupEngine(['false']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'false || ls' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('should block unauthorized chained command with ;', async () => {
    engine = setupEngine(['echo']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo hi; ls' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('should block unauthorized command in pipe |', async () => {
    engine = setupEngine(['echo']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo hi | grep "hi"' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('should allow authorized command in pipe |', async () => {
    engine = setupEngine(['echo', 'grep']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo hi | grep "hi"' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should block unauthorized chained command with &', async () => {
    engine = setupEngine(['echo']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo hi & ls' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('should allow authorized chained command with &', async () => {
    engine = setupEngine(['echo', 'ls']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo hi & ls' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should block unauthorized command in nested substitution', async () => {
    engine = setupEngine(['echo', 'cat']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo $(cat $(ls))' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('should allow authorized command in nested substitution', async () => {
    engine = setupEngine(['echo', 'cat', 'ls']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo $(cat $(ls))' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should block command redirection if not explicitly allowed', async () => {
    engine = setupEngine(['echo']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo hi > /tmp/test' } },
      undefined,
    );
    // Inherent policy: redirection downgrades to ASK_USER
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });
});
