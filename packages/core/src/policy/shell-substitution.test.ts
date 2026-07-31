/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeAll, vi } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { PolicyDecision } from './types.js';
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
