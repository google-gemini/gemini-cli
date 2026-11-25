/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeAll, vi } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { ApprovalMode, PolicyDecision } from './types.js';
import { SafeRegExp } from './safe-regex.js';
import { buildArgsPatterns } from './utils.js';
import { initializeShellParsers } from '../utils/shell-utils.js';

// Mock node:os to ensure shell-utils logic always thinks it's on a POSIX-like system.
// This ensures that internal calls to getShellConfiguration() and isWindows()
// within the shell-utils module return 'bash' configuration, even on Windows CI.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    default: {
      ...actual,
      platform: () => 'linux',
    },
    platform: () => 'linux',
  };
});

// Mock shell-utils to ensure consistent behavior across platforms (especially Windows CI)
// We want to test PolicyEngine logic with Bash syntax rules.
vi.mock('../utils/shell-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/shell-utils.js')>();
  return {
    ...actual,
    getShellConfiguration: () => ({
      executable: 'bash',
      argsPrefix: ['-c'],
      shell: 'bash',
    }),
  };
});

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
          argsPattern: SafeRegExp.compile(`"command":"${blockedCmd}"`),
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

  it('should block denied commands hidden behind prefix wrappers, shell flags, and trailing args', async () => {
    const engine = setupEngine('dangerous_cmd');
    const wrappedDangerous = [
      "env sh -c 'dangerous_cmd'",
      "nice sh -c 'dangerous_cmd'",
      "timeout 10 sh -c 'dangerous_cmd'",
      "nohup sh -c 'dangerous_cmd'",
      "setsid sh -c 'dangerous_cmd'",
      "/usr/bin/env sh -c 'dangerous_cmd'",
      "sh -e -c 'dangerous_cmd'",
      "bash -lc 'dangerous_cmd'",
      "sh -c 'dangerous_cmd' ''",
      "sh -c 'dangerous_cmd' _ arg1",
      "sh -c >/dev/null 'dangerous_cmd'",
      "env >/dev/null sh -c 'dangerous_cmd'",
      "FOO='' sh -c 'dangerous_cmd'",
      'sudo FOO="bar" sh -c \'dangerous_cmd\'',
      "sh -oc noglob 'dangerous_cmd'",
      'sh -e -c true\\ a\\\\b\\;dangerous_cmd',
      'bash -c $"dangerous_cmd"',
      "watch -xn 1 sh -c 'dangerous_cmd'",
      "echo x | xargs sh -c 'dangerous_cmd'",
      "pwsh -c 'Write-Host;' 'dangerous_cmd'",
      'cmd.exe /c "echo" "& dangerous_cmd"',
      "sh -c >| /dev/null 'dangerous_cmd'",
    ];

    for (const command of wrappedDangerous) {
      const result = await engine.check(
        { name: 'run_shell_command', args: { command } },
        'test-server',
      );
      expect(result.decision, `Expected DENY for: ${command}`).toBe(
        PolicyDecision.DENY,
      );
    }
  });

  it('should downgrade prefix-allowed wrapper commands containing hidden command substitution', async () => {
    const prefixes = [
      'sh',
      'bash',
      'env',
      '/usr/bin/env',
      'nice',
      'timeout',
      'nohup',
      'setsid',
      'pwsh',
      'cmd.exe',
      'echo',
    ];
    const rules = prefixes.flatMap((prefix) =>
      buildArgsPatterns(undefined, prefix, undefined)
        .filter((pattern): pattern is string => pattern !== undefined)
        .map((pattern) => ({
          toolName: 'run_shell_command',
          argsPattern: SafeRegExp.compile(pattern),
          decision: PolicyDecision.ALLOW,
          allowRedirection: true,
          priority: 4.1,
        })),
    );

    const interactiveEngine = new PolicyEngine({
      rules,
      defaultDecision: PolicyDecision.ASK_USER,
      approvalMode: ApprovalMode.DEFAULT,
      nonInteractive: false,
    });
    const headlessEngine = new PolicyEngine({
      rules,
      defaultDecision: PolicyDecision.ASK_USER,
      approvalMode: ApprovalMode.DEFAULT,
      nonInteractive: true,
    });

    const bypassPayloads = [
      "sh -c 'echo ready $(whoami > ./neg-proof.txt)'",
      "env sh -c 'echo ready $(whoami > ./bypass-env.txt)'",
      "nice sh -c '$(whoami)'",
      "timeout 10 sh -c '$(whoami)'",
      "nohup sh -c '$(whoami)'",
      "setsid sh -c '$(whoami)'",
      "/usr/bin/env sh -c '$(whoami)'",
      "sh -e -c 'echo ready $(whoami > ./bypass-flag.txt)'",
      "bash -lc '$(whoami)'",
      "sh -c 'echo ready $(whoami > ./bypass-arg.txt)' ''",
      "sh -c '$(whoami)' &",
      "sh -c '$(whoami)' ;",
      "sh -c '$(whoami)' >/tmp/x",
      "sh -c '$(whoami)' # comment",
      "pwsh -com '$(Get-Process)'",
      "pwsh -ExecutionPolicy Bypass -Command '$(Get-Process)'",
      "cmd.exe /k '$(whoami)'",
      "cmd.exe /q /c '$(whoami)'",
      "env --default-signal sh -c '$(whoami)'",
      "timeout -fs KILL 5 sh -c '$(whoami)'",
      "bash -oc pipefail '$(whoami)'",
      `pwsh -c \u2018$(Get-Process)\u2019`,
      `pwsh -enc ${'A'.repeat(70_000)}`,
    ];

    for (const command of bypassPayloads) {
      const interactive = await interactiveEngine.check(
        { name: 'run_shell_command', args: { command } },
        undefined,
      );
      const headless = await headlessEngine.check(
        { name: 'run_shell_command', args: { command } },
        undefined,
      );
      expect(
        interactive.decision,
        `Expected ASK_USER (interactive) for: ${command}`,
      ).toBe(PolicyDecision.ASK_USER);
      expect(
        headless.decision,
        `Expected DENY (headless) for: ${command}`,
      ).toBe(PolicyDecision.DENY);
    }

    // Legitimate wrapped command without command substitution remains allowed
    // when both outer prefix and inner command are allowed.
    const safeInteractive = await interactiveEngine.check(
      {
        name: 'run_shell_command',
        args: { command: "env sh -c 'echo ready'" },
      },
      undefined,
    );
    expect(safeInteractive.decision).toBe(PolicyDecision.ALLOW);
  });

  it('should fail closed when shell wrapper nesting exceeds policy recursion depth limit', async () => {
    const prefixes = ['sh', 'env', 'true', 'echo'];
    const rules = prefixes.flatMap((prefix) =>
      buildArgsPatterns(undefined, prefix, undefined)
        .filter((pattern): pattern is string => pattern !== undefined)
        .map((pattern) => ({
          toolName: 'run_shell_command',
          argsPattern: SafeRegExp.compile(pattern),
          decision: PolicyDecision.ALLOW,
          allowRedirection: true,
          priority: 4.1,
        })),
    );

    const interactiveEngine = new PolicyEngine({
      rules,
      defaultDecision: PolicyDecision.ASK_USER,
      approvalMode: ApprovalMode.DEFAULT,
      nonInteractive: false,
    });
    const headlessEngine = new PolicyEngine({
      rules,
      defaultDecision: PolicyDecision.ASK_USER,
      approvalMode: ApprovalMode.DEFAULT,
      nonInteractive: true,
    });

    // Interleave `true &&` with `env sh -c` so neither stripShellWrapper alone
    // nor compound command splitting can bypass the wrapperDepth cap.
    const deepWrapped = [
      'true && env sh -c "',
      'true && env sh -c \\"',
      'true && env sh -c \\\\\\"',
      'true && env sh -c \\\\\\\\\\\\\\"',
      'true && env sh -c \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"echo deep\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\"',
      '\\\\\\\\\\\\\\"',
      '\\\\\\"',
      '\\"',
      '"',
    ].join('');

    const interactive = await interactiveEngine.check(
      { name: 'run_shell_command', args: { command: deepWrapped } },
      undefined,
    );
    const headless = await headlessEngine.check(
      { name: 'run_shell_command', args: { command: deepWrapped } },
      undefined,
    );

    expect(interactive.decision).toBe(PolicyDecision.ASK_USER);
    expect(headless.decision).toBe(PolicyDecision.DENY);
  });

  it('should not upgrade a compound command to ALLOW when a wrapped payload is only allowed by a catch-all rule', async () => {
    const envRules = buildArgsPatterns(undefined, 'env', undefined)
      .filter((pattern): pattern is string => pattern !== undefined)
      .map((pattern) => ({
        toolName: 'run_shell_command',
        argsPattern: SafeRegExp.compile(pattern),
        decision: PolicyDecision.ALLOW,
        priority: 4.1,
      }));
    const trueRules = buildArgsPatterns(undefined, 'true', undefined)
      .filter((pattern): pattern is string => pattern !== undefined)
      .map((pattern) => ({
        toolName: 'run_shell_command',
        argsPattern: SafeRegExp.compile(pattern),
        decision: PolicyDecision.ALLOW,
        priority: 4.1,
      }));

    // Top-level compound command falls back to catch-all ASK_USER (no argsPattern),
    // while an inner wrapped command `ls -la` is only allowed via known-safe
    // heuristics (no explicit argsPattern rule).
    const engine = new PolicyEngine({
      rules: [
        ...envRules,
        ...trueRules,
        {
          toolName: 'run_shell_command',
          decision: PolicyDecision.ASK_USER,
          priority: 1,
        },
      ],
      defaultDecision: PolicyDecision.ASK_USER,
      approvalMode: ApprovalMode.DEFAULT,
      nonInteractive: false,
    });

    const result = await engine.check(
      {
        name: 'run_shell_command',
        args: { command: "true && env sh -c 'ls -la'" },
      },
      undefined,
    );
    expect(result.decision).toBe(PolicyDecision.ASK_USER);
  });
});
