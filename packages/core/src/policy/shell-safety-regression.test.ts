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
import { SafeRegExp } from './safe-regex.js';

describe('PolicyEngine - Shell Safety Regression Suite', () => {
  let engine: PolicyEngine;

  beforeAll(async () => {
    await initializeShellParsers();
  });

  const setupEngine = (
    allowedCommands: string[],
    options?: { allowCommandSubstitution?: boolean },
  ) => {
    const allowCommandSubstitution = options?.allowCommandSubstitution ?? false;
    const rules = allowedCommands.map((cmd) => ({
      toolName: 'run_shell_command',
      decision: PolicyDecision.ALLOW,
      argsPattern: SafeRegExp.compile(buildArgsPatterns(undefined, cmd)[0]!),
      allowCommandSubstitution,
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
    engine = setupEngine(['echo', 'cat'], { allowCommandSubstitution: true });
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo $(cat $(ls))' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('should block command substitution if not explicitly allowed', async () => {
    engine = setupEngine(['echo', 'cat', 'ls']);
    const result = await engine.check(
      { name: 'run_shell_command', args: { command: 'echo $(cat $(ls))' } },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('should allow authorized command in nested substitution when allowCommandSubstitution is true', async () => {
    engine = setupEngine(['echo', 'cat', 'ls'], {
      allowCommandSubstitution: true,
    });
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

describe('PolicyEngine - top-level command argument matching', () => {
  beforeAll(async () => {
    await initializeShellParsers();
  });

  const setupEngine = (
    argsPattern: string,
    options?: { nonInteractive?: boolean; defaultDecision?: PolicyDecision },
  ) =>
    new PolicyEngine({
      rules: [
        {
          toolName: 'run_shell_command',
          decision: PolicyDecision.ALLOW,
          argsPattern: SafeRegExp.compile(argsPattern),
          priority: 10,
        },
      ],
      approvalMode: ApprovalMode.DEFAULT,
      nonInteractive: options?.nonInteractive,
      defaultDecision: options?.defaultDecision ?? PolicyDecision.ASK_USER,
    });

  const checkCommand = async (
    engine: PolicyEngine,
    args: Record<string, unknown>,
  ) =>
    (await engine.check({ name: 'run_shell_command', args }, undefined))
      .decision;

  const nestedArgumentCases: Array<Record<string, unknown>> = [
    {
      command: 'touch /tmp/gcli_policy_marker',
      extra: { command: 'git status' },
    },
    {
      command: 'touch /tmp/gcli_policy_marker',
      extra: [{ command: 'git status' }],
    },
    {
      command: 'touch /tmp/gcli_policy_marker',
      additional_permissions: { command: 'git status' },
    },
    { command: "eval 'date'", extra: { command: 'git status' } },
    {
      command: "env sh -c 'date > /tmp/gcli_policy_marker'",
      extra: { command: 'git status' },
    },
  ];

  it('should ask the user when only a nested argument matches a commandPrefix rule', async () => {
    const engine = setupEngine(buildArgsPatterns(undefined, 'git')[0]!);

    for (const args of nestedArgumentCases) {
      expect(await checkCommand(engine, args)).toBe(PolicyDecision.ASK_USER);
    }
  });

  it('should ask the user when only a nested argument matches a commandRegex rule', async () => {
    const engine = setupEngine(
      buildArgsPatterns(undefined, undefined, 'git (status|log)')[0]!,
    );

    for (const args of nestedArgumentCases) {
      expect(await checkCommand(engine, args)).toBe(PolicyDecision.ASK_USER);
    }
  });

  it('should allow an approved command when other top-level arguments are present', async () => {
    const engine = setupEngine(buildArgsPatterns(undefined, 'git')[0]!);

    expect(
      await checkCommand(engine, {
        command: 'git status',
        description: 'Show status',
        dir_path: '.',
      }),
    ).toBe(PolicyDecision.ALLOW);
  });

  it('should deny in non-interactive mode when only a nested argument matches', async () => {
    const engine = setupEngine(buildArgsPatterns(undefined, 'git')[0]!, {
      nonInteractive: true,
      defaultDecision: PolicyDecision.DENY,
    });

    expect(
      await checkCommand(engine, {
        command: 'touch /tmp/gcli_policy_marker',
        extra: { command: 'git status' },
      }),
    ).toBe(PolicyDecision.DENY);
  });
});
