/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { vi, describe, expect, it, afterEach, beforeEach } from 'vitest';
import * as gitUtils from '../../utils/gitUtils.js';
import { setupGithubCommand } from './setupGithubCommand.js';
import { CommandContext, ToolActionReturn } from './types.js';
import * as commandUtils from '../utils/commandUtils.js';

vi.mock('child_process');

// Mock fetch globally
global.fetch = vi.fn();

vi.mock('../../utils/gitUtils.js', () => ({
  isGitHubRepository: vi.fn(),
  getGitRepoRoot: vi.fn(),
  getLatestGitHubRelease: vi.fn(),
  getGitHubRepoInfo: vi.fn(),
}));

vi.mock('../utils/commandUtils.js', () => ({
  getUrlOpenCommand: vi.fn(),
}));

describe('setupGithubCommand', async () => {
  let scratchDir = '';

  beforeEach(async () => {
    vi.resetAllMocks();
    scratchDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'setup-github-command-'),
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (scratchDir) await fs.rm(scratchDir, { recursive: true });
  });

  it('returns a tool action to download github workflows and handles paths', async () => {
    const fakeRepoOwner = 'fake';
    const fakeRepoName = 'repo';
    const fakeRepoRoot = scratchDir;
    const fakeReleaseVersion = 'v1.2.3';

    const workflows = [
      'gemini-cli.yml',
      'gemini-issue-automated-triage.yml',
      'gemini-issue-scheduled-triage.yml',
      'gemini-pr-review.yml',
    ];
    for (const workflow of workflows) {
      vi.mocked(global.fetch).mockReturnValueOnce(
        Promise.resolve(new Response(workflow)),
      );
    }

    vi.mocked(gitUtils.isGitHubRepository).mockReturnValueOnce(true);
    vi.mocked(gitUtils.getGitRepoRoot).mockReturnValueOnce(fakeRepoRoot);
    vi.mocked(gitUtils.getLatestGitHubRelease).mockResolvedValueOnce(
      fakeReleaseVersion,
    );
    vi.mocked(gitUtils.getGitHubRepoInfo).mockReturnValue({
      owner: fakeRepoOwner,
      repo: fakeRepoName,
    });
    vi.mocked(commandUtils.getUrlOpenCommand).mockReturnValueOnce(
      'fakeOpenCommand',
    );

    const result = (await setupGithubCommand.action?.(
      {} as CommandContext,
      '',
    )) as ToolActionReturn;

    const { command } = result.toolArgs;

    const expectedSubstrings = [
      `set -eEuo pipefail`,
      `fakeOpenCommand "https://github.com/google-github-actions/run-gemini-cli`,
    ];

    for (const substring of expectedSubstrings) {
      expect(command).toContain(substring);
    }

    for (const workflow of workflows) {
      const workflowFile = path.join(
        scratchDir,
        '.github',
        'workflows',
        workflow,
      );
      const contents = await fs.readFile(workflowFile, 'utf8');
      expect(contents).toContain(workflow);
    }
  });
});
