/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { ApprovalMode, PolicyDecision, type PolicyRule } from './types.js';
import { NoopSandboxManager } from '../services/sandboxManager.js';
import { initializeShellParsers } from '../utils/shell-utils.js';

// These cases describe bash semantics. Report a POSIX platform on every host
// (including Windows CI) so that the shell configuration resolves to bash and
// NoopSandboxManager uses the POSIX command classifier.
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

// Mirrors the default `run_shell_command` rule in `policies/write.toml`
// (default tier 1 + priority 10 / 1000, interactive sessions only).
const DEFAULT_SHELL_RULE: PolicyRule = {
  toolName: 'run_shell_command',
  decision: PolicyDecision.ASK_USER,
  priority: 1.01,
  interactive: true,
};

// An explicit user rule that allows every shell command
// (user tier 4 + priority 100 / 1000, no argsPattern).
const ALLOW_ALL_SHELL_RULE: PolicyRule = {
  toolName: 'run_shell_command',
  decision: PolicyDecision.ALLOW,
  priority: 4.1,
};

// Bash expands these arguments before the command runs, so the argument list
// that runs differs from the text that the classifier sees.
const EXPANDED_ARGUMENT_COMMANDS = [
  'find . {-exec,sh,marker.sh,\\;}',
  "find . -maxdepth 0 {-exec,echo,QA,'{}',+}",
  'find . -maxdepth 0 -{delete,print}',
  'echo {1..3}',
  'find . ${x:--exec} echo hi \\;',
  'ls ${d:-/etc}',
  'ls ./$TARGET_SUBPATH',
  'ls "$HOME"',
  'ls $1',
  "find . -$'exec' echo hi \\;",
  'find . -$"exec" echo hi \\;',
  "git log $'--output=report.txt'",
  "git diff --$'ext-diff'",
  'find . -exe[c] sh marker.sh \\;',
  'ls *.md',
  'ls ?.md',
  'git log *',
  'sed -n 1p *',
  'bash -lc "find . -maxdepth 0 {-delete,}"',
  'zsh -lc "find . -maxdepth 0 {-delete,}"',
  'find . -maxdepth 0 -ex\\\nec sh marker.sh \\;',
  'find . -maxdepth 0 "-ex\\\nec" sh marker.sh \\;',
  'find . -maxdepth 0 -name a# -o -exec sh marker.sh \\;',
];

// Commands that already require confirmation for other reasons.
const CONFIRMATION_COMMANDS = [
  'find . -exec sh marker.sh \\;',
  'find . {-exec,sh,marker.sh,;}',
  'bash -c "find . {-exec,sh,marker.sh,\\;}"',
  'ls $((1+2))',
  'ls $(echo .)',
];

// Read-only commands whose arguments reach the program unchanged.
const LITERAL_ARGUMENT_COMMANDS = [
  'ls -la',
  "find . -name '*.md'",
  "ls '*.md'",
  'ls "*.md"',
  "echo '{red,green}.txt'",
  'echo "{a,b}"',
  "grep -E 'a{1,3}' f.txt",
  "cat 'file{1,2}.txt'",
  'echo {id}',
  'bash -lc "ls -la"',
];

describe('shell argument expansion handling', () => {
  let workspace: string;

  beforeAll(async () => {
    await initializeShellParsers();
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gcli-expansion-'));
  });

  afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  // Returns the policy decision only. The command is never executed.
  const decide = async (
    command: string,
    approvalMode: ApprovalMode,
    rules: PolicyRule[] = [DEFAULT_SHELL_RULE],
  ): Promise<PolicyDecision> => {
    const engine = new PolicyEngine({
      rules,
      approvalMode,
      nonInteractive: false,
      sandboxManager: new NoopSandboxManager({ workspace }),
    });
    const { decision } = await engine.check(
      { name: 'run_shell_command', args: { command, dir_path: workspace } },
      undefined,
    );
    return decision;
  };

  // Test titles use template literals because `it.each` title formatting
  // treats `$1` in a command as a placeholder.
  describe.each([ApprovalMode.DEFAULT, ApprovalMode.AUTO_EDIT])(
    '%s approval mode',
    (mode) => {
      for (const command of EXPANDED_ARGUMENT_COMMANDS) {
        it(`keeps ASK_USER when arguments change after shell expansion: ${command}`, async () => {
          expect(await decide(command, mode)).toBe(PolicyDecision.ASK_USER);
        });
      }

      for (const command of CONFIRMATION_COMMANDS) {
        it(`keeps ASK_USER for commands that already require confirmation: ${command}`, async () => {
          expect(await decide(command, mode)).toBe(PolicyDecision.ASK_USER);
        });
      }

      for (const command of LITERAL_ARGUMENT_COMMANDS) {
        it(`keeps auto-approval for read-only commands with literal arguments: ${command}`, async () => {
          expect(await decide(command, mode)).toBe(PolicyDecision.ALLOW);
        });
      }

      for (const command of [
        'echo $HOME',
        'ls *.md',
        'find . {-exec,sh,marker.sh,\\;}',
      ]) {
        it(`keeps the decision of an explicit ALLOW rule without argsPattern: ${command}`, async () => {
          expect(
            await decide(command, mode, [
              DEFAULT_SHELL_RULE,
              ALLOW_ALL_SHELL_RULE,
            ]),
          ).toBe(PolicyDecision.ALLOW);
        });
      }
    },
  );
});
