/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock shell-utils to avoid relying on tree-sitter WASM which is flaky in CI on Windows
vi.mock('../utils/shell-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/shell-utils.js')>();

  // Static map of test commands to their expected subcommands
  // This mirrors what the real parser would output for these specific strings
  const commandMap: Record<string, string[]> = {
    'git log': ['git log'],
    'git log --oneline': ['git log --oneline'],
    'git logout': ['git logout'],
    'git log && rm -rf /': ['git log', 'rm -rf /'],
    'git log; rm -rf /': ['git log', 'rm -rf /'],
    'git log || rm -rf /': ['git log', 'rm -rf /'],
    'git log &&& rm -rf /': [], // Simulates parse failure
    'echo $(rm -rf /)': ['echo $(rm -rf /)', 'rm -rf /'],
    'echo $(git log)': ['echo $(git log)', 'git log'],
    'echo `rm -rf /`': ['echo `rm -rf /`', 'rm -rf /'],
    'diff <(git log) <(rm -rf /)': [
      'diff <(git log) <(rm -rf /)',
      'git log',
      'rm -rf /',
    ],
    'tee >(rm -rf /)': ['tee >(rm -rf /)', 'rm -rf /'],
    'git log | rm -rf /': ['git log', 'rm -rf /'],
    'git log --format=$(rm -rf /)': [
      'git log --format=$(rm -rf /)',
      'rm -rf /',
    ],
    'git log && echo $(git log | rm -rf /)': [
      'git log',
      'echo $(git log | rm -rf /)',
      'git log',
      'rm -rf /',
    ],
    'git log && echo $(git log)': ['git log', 'echo $(git log)', 'git log'],
    'git log > /tmp/test': ['git log > /tmp/test'],
    'git log @(Get-Process)': [], // Simulates parse failure (Bash parser vs PowerShell syntax)
    'git commit -m "msg" && git push': ['git commit -m "msg"', 'git push'],
    'git status && unknown_command': ['git status', 'unknown_command'],
    'unknown_command_1 && another_unknown_command': [
      'unknown_command_1',
      'another_unknown_command',
    ],
    'known_ask_command_1 && known_ask_command_2': [
      'known_ask_command_1',
      'known_ask_command_2',
    ],
  };

  return {
    ...actual,
    initializeShellParsers: vi.fn(),
    splitCommands: (command: string) => {
      if (Object.prototype.hasOwnProperty.call(commandMap, command)) {
        return commandMap[command];
      }
      const known = commandMap[command];
      if (known) return known;
      // Default fallback for unmatched simple cases in development, but explicit map is better
      return [command];
    },
    hasRedirection: (command: string) =>
      // Simple regex check sufficient for testing the policy engine's handling of the *result* of hasRedirection
      /[><]/.test(command),
  };
});

import { PolicyEngine } from './policy-engine.js';
import { PolicyDecision, ApprovalMode } from './types.js';
import type { FunctionCall } from '@google/genai';
import { buildArgsPatterns } from './utils.js';

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
      approvalMode: ApprovalMode.DEFAULT,
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

  it('SHOULD NOT allow generic redirection > /tmp/test', async () => {
    // Current logic downgrades ALLOW to ASK_USER for redirections if redirection is not explicitly allowed.
    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log > /tmp/test' },
    };
    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });

  it('SHOULD allow generic redirection > /tmp/test if allowRedirection is true', async () => {
    // If PolicyRule has allowRedirection: true, it should stay ALLOW
    const argsPatternsGitLog = buildArgsPatterns(
      undefined,
      'git log',
      undefined,
    );
    const policyWithRedirection = new PolicyEngine({
      rules: [
        {
          toolName: 'run_shell_command',
          argsPattern: new RegExp(argsPatternsGitLog[0]!),
          decision: PolicyDecision.ALLOW,
          priority: 2,
          allowRedirection: true,
        },
      ],
      defaultDecision: PolicyDecision.ASK_USER,
    });

    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git log > /tmp/test' },
    };
    const result = await policyWithRedirection.check(toolCall, undefined);
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

  it('SHOULD match DENY rule even if nested/chained with unknown command', async () => {
    // Scenario:
    // git commit -m "..." (Unknown/No Rule -> ASK_USER)
    // git push (DENY -> DENY)
    // Overall should be DENY.
    const argsPatternsPush = buildArgsPatterns(
      undefined,
      'git push',
      undefined,
    );

    const denyPushPolicy = new PolicyEngine({
      rules: [
        {
          toolName: 'run_shell_command',
          argsPattern: new RegExp(argsPatternsPush[0]!),
          decision: PolicyDecision.DENY,
          priority: 2,
        },
      ],
      defaultDecision: PolicyDecision.ASK_USER,
    });

    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git commit -m "msg" && git push' },
    };

    const result = await denyPushPolicy.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.DENY);
  });

  it('SHOULD aggregate ALLOW + ASK_USER to ASK_USER and blame the ASK_USER part', async () => {
    // Scenario:
    // `git status` (ALLOW) && `unknown_command` (ASK_USER by default)
    // Expected: ASK_USER, and the matched rule should be related to the unknown_command
    const argsPatternsGitStatus = buildArgsPatterns(
      undefined,
      'git status',
      undefined,
    );

    const policyEngine = new PolicyEngine({
      rules: [
        {
          toolName: 'run_shell_command',
          argsPattern: new RegExp(argsPatternsGitStatus[0]!),
          decision: PolicyDecision.ALLOW,
          priority: 2,
          name: 'allow_git_status_rule', // Give a name to easily identify
        },
      ],
      defaultDecision: PolicyDecision.ASK_USER,
    });

    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'git status && unknown_command' },
    };

    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
    // Expect the matched rule to be null/undefined since it's the default decision for 'unknown_command'
    // or the rule that led to the ASK_USER decision. In this case, it should be the rule for 'unknown_command', which is the default decision.
    // The policy engine's `matchedRule` will be the rule that caused the final decision.
    // If it's a default ASK_USER, then `result.rule` should be undefined.
    expect(result.rule).toBeUndefined();
  });

  it('SHOULD aggregate ASK_USER (default) + ASK_USER (rule) to ASK_USER and blame the specific ASK_USER rule', async () => {
    // Scenario:
    // `unknown_command_1` (ASK_USER by default) && `another_unknown_command` (ASK_USER by explicit rule)
    // Expected: ASK_USER, and the matched rule should be the explicit ASK_USER rule
    const argsPatternsAnotherUnknown = buildArgsPatterns(
      undefined,
      'another_unknown_command',
      undefined,
    );

    const policyEngine = new PolicyEngine({
      rules: [
        {
          toolName: 'run_shell_command',
          argsPattern: new RegExp(argsPatternsAnotherUnknown[0]!),
          decision: PolicyDecision.ASK_USER,
          priority: 2,
          name: 'ask_another_unknown_command_rule',
        },
      ],
      defaultDecision: PolicyDecision.ASK_USER,
    });

    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'unknown_command_1 && another_unknown_command' },
    };

    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
    // The first command triggers default ASK_USER (undefined rule).
    // The second triggers explicit ASK_USER rule.
    // We attribute to the first cause => undefined.
    expect(result.rule).toBeUndefined();
  });

  it('SHOULD aggregate ASK_USER (rule) + ASK_USER (rule) to ASK_USER and blame the first specific ASK_USER rule in subcommands', async () => {
    // Scenario:
    // `known_ask_command_1` (ASK_USER by explicit rule 1) && `known_ask_command_2` (ASK_USER by explicit rule 2)
    // Expected: ASK_USER, and the matched rule should be explicit ASK_USER rule 1.
    // The current implementation prioritizes the rule that changes the decision to ASK_USER, if any.
    // If multiple rules lead to ASK_USER, it takes the first one.
    const argsPatternsAsk1 = buildArgsPatterns(
      undefined,
      'known_ask_command_1',
      undefined,
    );
    const argsPatternsAsk2 = buildArgsPatterns(
      undefined,
      'known_ask_command_2',
      undefined,
    );

    const policyEngine = new PolicyEngine({
      rules: [
        {
          toolName: 'run_shell_command',
          argsPattern: new RegExp(argsPatternsAsk1[0]!),
          decision: PolicyDecision.ASK_USER,
          priority: 2,
          name: 'ask_rule_1',
        },
        {
          toolName: 'run_shell_command',
          argsPattern: new RegExp(argsPatternsAsk2[0]!),
          decision: PolicyDecision.ASK_USER,
          priority: 2,
          name: 'ask_rule_2',
        },
      ],
      defaultDecision: PolicyDecision.ALLOW, // Set default to ALLOW to ensure rules are hit
    });

    const toolCall: FunctionCall = {
      name: 'run_shell_command',
      args: { command: 'known_ask_command_1 && known_ask_command_2' },
    };

    const result = await policyEngine.check(toolCall, undefined);
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
    // Expect the rule that first caused ASK_USER to be blamed
    expect(result.rule?.name).toBe('ask_rule_1');
  });
});
