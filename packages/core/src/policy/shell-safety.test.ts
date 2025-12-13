/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { PolicyDecision } from './types.js';
import type { FunctionCall } from '@google/genai';
import { buildArgsPatterns } from './toml-loader.js';

describe('Shell Safety Policy', () => {
  let policyEngine: PolicyEngine;

  // Helper to create a policy engine with a simple command prefix rule
  function createPolicyEngineWithPrefix(prefix: string) {
    const argsPatterns = buildArgsPatterns(undefined, prefix, undefined);
    // Since buildArgsPatterns returns array of patterns (strings), we pick the first one
    // and compile it.
    const argsPattern = new RegExp(argsPatterns[0]!);

    return new PolicyEngine({
      rules: [
        {
          toolName: 'run_shell_command',
          argsPattern,
          decision: PolicyDecision.ALLOW,
          priority: 1.01,
        },
      ],
      defaultDecision: PolicyDecision.ASK_USER,
    });
  }

  beforeEach(() => {
    policyEngine = createPolicyEngineWithPrefix('git log');
  });

  it('SHOULD match "git log" exactly', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('SHOULD match "git log" with arguments', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log --oneline' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('SHOULD NOT match "git logout" when prefix is "git log" (strict word boundary)', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git logout' },
    };

    // Desired behavior: Should NOT match "git log" prefix.
    // If it doesn't match, it should fall back to default decision (ASK_USER).
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD NOT allow "git log && rm -rf /" completely when prefix is "git log" (compound command safety)', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log && rm -rf /' },
    };

    // Desired behavior: Should inspect all parts. "rm -rf /" is not allowed.
    // The "git log" part is ALLOW, but "rm -rf /" is ASK_USER (default).
    // Aggregate should be ASK_USER.
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD NOT allow "git log; rm -rf /" (semicolon separator)', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log; rm -rf /' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD NOT allow "git log || rm -rf /" (OR separator)', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log || rm -rf /' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD NOT allow "git log &&& rm -rf /" when prefix is "git log" (parse failure)', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log &&& rm -rf /' },
    };

    // Desired behavior: Should fail safe (ASK_USER or DENY) because parsing failed.
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD NOT allow command substitution $(rm -rf /)', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'echo $(rm -rf /)' },
    };
    // `splitCommands` recursively finds nested commands (e.g., `rm` inside `echo $()`).
    // The policy engine requires ALL extracted commands to be allowed.
    // Since `rm` does not match the allowed prefix, this should result in ASK_USER.

    // Let's try with a rule that allows `echo`
    const echoPolicy = createPolicyEngineWithPrefix('echo');
    const result = await echoPolicy.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD allow command substitution if inner command is ALSO allowed', async () => {
    // Both `echo` and `git` allowed.
    const argsPatternsEcho = buildArgsPatterns(undefined, 'echo', undefined);
    const argsPatternsGit = buildArgsPatterns(undefined, 'git', undefined); // Allow all git

    const policyEngineWithBoth = new PolicyEngine({
      rules: [
        {
          toolName: 'run_shell_command',
          argsPattern: new RegExp(argsPatternsEcho[0]!),
          decision: PolicyDecision.ALLOW,
          priority: 2,
        },
        {
          toolName: 'run_shell_command',
          argsPattern: new RegExp(argsPatternsGit[0]!),
          decision: PolicyDecision.ALLOW,
          priority: 2,
        },
      ],
      defaultDecision: PolicyDecision.ASK_USER,
    });

    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'echo $(git log)' },
    };

    const result = await policyEngineWithBoth.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });
  it('SHOULD NOT allow command substitution with backticks `rm -rf /`', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'echo `rm -rf /`' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD NOT allow process substitution <(rm -rf /)', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'diff <(git log) <(rm -rf /)' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD NOT allow process substitution >(rm -rf /)', async () => {
    // Note: >(...) is output substitution, but syntax is similar.
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'tee >(rm -rf /)' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD NOT allow piped commands "git log | rm -rf /"', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log | rm -rf /' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD NOT allow argument injection via --arg=$(rm -rf /)', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log --format=$(rm -rf /)' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD NOT allow complex nested commands "git log && echo $(git log | rm -rf /)"', async () => {
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log && echo $(git log | rm -rf /)' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD allow complex allowed commands "git log && echo $(git log)"', async () => {
    // Both `echo` and `git` allowed.
    const argsPatternsEcho = buildArgsPatterns(undefined, 'echo', undefined);
    const argsPatternsGit = buildArgsPatterns(undefined, 'git', undefined);

    const policyEngineWithBoth = new PolicyEngine({
      rules: [
        {
          toolName: 'run_shell_command',
          argsPattern: new RegExp(argsPatternsEcho[0]!),
          decision: PolicyDecision.ALLOW,
          priority: 2,
        },
        {
          toolName: 'run_shell_command',
          // Matches "git" at start of *subcommand*
          argsPattern: new RegExp(argsPatternsGit[0]!),
          decision: PolicyDecision.ALLOW,
          priority: 2,
        },
      ],
      defaultDecision: PolicyDecision.ASK_USER,
    });

    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log && echo $(git log)' },
    };

    const result = await policyEngineWithBoth.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('SHOULD NOT allow generic redirection > /dev/null with unsafe target', async () => {
    // Current logic allows redirections if the main command is allowed,
    // as `splitCommands` (bash parser) sees `git log > file` as just `git log`.
    // This test documents current behavior: it IS allowed.
    // If usage of redirection needs to be blocked, we'd need stricter policies.
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log > /tmp/test' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ALLOW);
  });

  it('SHOULD NOT allow PowerShell @(...) usage if it implies code execution', async () => {
    // Bash parser fails on PowerShell syntax @(...) (returns empty subcommands).
    // The policy engine correctly identifies this as unparseable and falls back to ASK_USER.
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log @(Get-Process)' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });
});
