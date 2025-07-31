/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, expect, it, afterEach, beforeEach } from 'vitest';
import * as child_process from 'child_process';
import { setupGithubCommand } from './setupGithubCommand.js';
import { CommandContext, ToolActionReturn } from './types.js';

vi.mock('child_process');

describe('setupGithubCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a tool action to download github workflows and handles paths', () => {
    const fakeRepoRoot = '/github.com/fake/repo/root';
    vi.mocked(child_process.execSync).mockReturnValue(fakeRepoRoot);

    const result = setupGithubCommand.action?.(
      {} as CommandContext,
      '',
    ) as ToolActionReturn;

    expect(result.type).toBe('tool');
    expect(result.toolName).toBe('run_shell_command');
    expect(child_process.execSync).toHaveBeenCalledWith(
      'git rev-parse --show-toplevel',
      {
        encoding: 'utf-8',
      },
    );
    expect(child_process.execSync).toHaveBeenCalledWith('git remote -v', {
      encoding: 'utf-8',
    });

    const { command } = result.toolArgs;

    const expectedSubstrings = [
      `mkdir -p "${fakeRepoRoot}/.github/workflows"`,
      `curl -fsSL -o "${fakeRepoRoot}/.github/workflows/gemini-cli.yml"`,
      `curl -fsSL -o "${fakeRepoRoot}/.github/workflows/gemini-issue-automated-triage.yml"`,
      `curl -fsSL -o "${fakeRepoRoot}/.github/workflows/gemini-issue-scheduled-triage.yml"`,
      `curl -fsSL -o "${fakeRepoRoot}/.github/workflows/gemini-pr-review.yml"`,
      'https://raw.githubusercontent.com/google-github-actions/run-gemini-cli/refs/heads/main/workflows/',
    ];

    for (const substring of expectedSubstrings) {
      expect(command).toContain(substring);
    }
  });

  it('throws an error if git root cannot be determined', () => {
    vi.mocked(child_process.execSync).mockReturnValue('');
    expect(() => {
      setupGithubCommand.action?.({} as CommandContext, '');
    }).toThrow('Unable to determine the Git root directory.');
  });
});
