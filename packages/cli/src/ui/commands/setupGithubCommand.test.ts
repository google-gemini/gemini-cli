/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, expect, it, afterEach, beforeEach } from 'vitest';
import * as gitUtils from '../../utils/gitUtils.js';
import { setupGithubCommand } from './setupGithubCommand.js';
import { CommandContext, ToolActionReturn } from './types.js';

vi.mock('child_process');

// Mock fetch globally
global.fetch = vi.fn();

vi.mock('../../utils/gitUtils.js', () => ({
  isGitHubRepository: vi.fn(),
  getGitRepoRoot: vi.fn(),
  getLatestGitHubRelease: vi.fn(),
  getGitHubRepoInfo: vi.fn(),
}));

describe('setupGithubCommand', async () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a tool action to download github workflows and handles paths', async () => {
    const fakeRepoOwner = 'fake';
    const fakeRepoName = 'repo';
    const fakeRepoRoot = `/github.com/${fakeRepoOwner}/${fakeRepoName}/root`;
    const fakeReleaseVersion = 'v1.2.3';

    vi.mocked(gitUtils.isGitHubRepository).mockReturnValueOnce(true);
    vi.mocked(gitUtils.getGitRepoRoot).mockReturnValueOnce(fakeRepoRoot);
    vi.mocked(gitUtils.getLatestGitHubRelease).mockResolvedValueOnce(
      fakeReleaseVersion,
    );
    vi.mocked(gitUtils.getGitHubRepoInfo).mockReturnValue({
      owner: fakeRepoOwner,
      repo: fakeRepoName,
    });

    const result = (await setupGithubCommand.action?.(
      {} as CommandContext,
      '',
    )) as ToolActionReturn;

    const { command } = result.toolArgs;

    const expectedSubstrings = [
      `set -eEuo pipefail`,
      `mkdir -p "${fakeRepoRoot}/.github/workflows"`,
      `curl --fail --location --output "/github.com/fake/repo/root/.github/workflows/gemini-cli.yml" --show-error --silent`,
      `curl --fail --location --output "/github.com/fake/repo/root/.github/workflows/gemini-issue-automated-triage.yml" --show-error --silent`,
      `curl --fail --location --output "/github.com/fake/repo/root/.github/workflows/gemini-issue-scheduled-triage.yml" --show-error --silent`,
      `curl --fail --location --output "/github.com/fake/repo/root/.github/workflows/gemini-pr-review.yml" --show-error --silent`,
      `https://raw.githubusercontent.com/google-github-actions/run-gemini-cli/refs/tags/`,
    ];

    for (const substring of expectedSubstrings) {
      expect(command).toContain(substring);
    }
  });
});
