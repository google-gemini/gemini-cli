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
import { setupGithubCommand, updateGitignore } from './setupGithubCommand.js';
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

    // Verify that .gitignore was created with the expected entries
    const gitignorePath = path.join(scratchDir, '.gitignore');
    const gitignoreExists = await fs
      .access(gitignorePath)
      .then(() => true)
      .catch(() => false);
    expect(gitignoreExists).toBe(true);

    if (gitignoreExists) {
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
      expect(gitignoreContent).toContain('.gemini/');
      expect(gitignoreContent).toContain('gha-creds-*.json');
    }
  });
});

describe('updateGitignore', () => {
  let scratchDir = '';

  beforeEach(async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'update-gitignore-'));
  });

  afterEach(async () => {
    if (scratchDir) await fs.rm(scratchDir, { recursive: true });
  });

  it('creates a new .gitignore file when none exists', async () => {
    await updateGitignore(scratchDir);

    const gitignorePath = path.join(scratchDir, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf8');

    expect(content).toBe('.gemini/\ngha-creds-*.json\n');
  });

  it('appends entries to existing .gitignore file', async () => {
    const gitignorePath = path.join(scratchDir, '.gitignore');
    const existingContent = '# Existing content\nnode_modules/\n';
    await fs.writeFile(gitignorePath, existingContent);

    await updateGitignore(scratchDir);

    const content = await fs.readFile(gitignorePath, 'utf8');

    expect(content).toBe(
      '# Existing content\nnode_modules/\n\n.gemini/\ngha-creds-*.json\n',
    );
  });

  it('does not add duplicate entries', async () => {
    const gitignorePath = path.join(scratchDir, '.gitignore');
    const existingContent = '.gemini/\nsome-other-file\ngha-creds-*.json\n';
    await fs.writeFile(gitignorePath, existingContent);

    await updateGitignore(scratchDir);

    const content = await fs.readFile(gitignorePath, 'utf8');

    expect(content).toBe(existingContent);
  });

  it('adds only missing entries when some already exist', async () => {
    const gitignorePath = path.join(scratchDir, '.gitignore');
    const existingContent = '.gemini/\nsome-other-file\n';
    await fs.writeFile(gitignorePath, existingContent);

    await updateGitignore(scratchDir);

    const content = await fs.readFile(gitignorePath, 'utf8');

    // Should add only the missing gha-creds-*.json entry
    expect(content).toBe('.gemini/\nsome-other-file\n\ngha-creds-*.json\n');
    expect(content).toContain('gha-creds-*.json');
    // Should not duplicate .gemini/ entry
    expect((content.match(/\.gemini\//g) || []).length).toBe(1);
  });

  it('does not get confused by entries in comments or as substrings', async () => {
    const gitignorePath = path.join(scratchDir, '.gitignore');
    const existingContent = [
      '# This is a comment mentioning .gemini/ folder',
      'my-app.gemini/config',
      '# Another comment with gha-creds-*.json pattern',
      'some-other-gha-creds-file.json',
      '',
    ].join('\n');
    await fs.writeFile(gitignorePath, existingContent);

    await updateGitignore(scratchDir);

    const content = await fs.readFile(gitignorePath, 'utf8');

    // Should add both entries since they don't actually exist as gitignore rules
    expect(content).toContain('.gemini/');
    expect(content).toContain('gha-creds-*.json');

    // Verify the entries were added (not just mentioned in comments)
    const lines = content
      .split('\n')
      .map((line) => line.split('#')[0].trim())
      .filter((line) => line);
    expect(lines).toContain('.gemini/');
    expect(lines).toContain('gha-creds-*.json');
    expect(lines).toContain('my-app.gemini/config');
    expect(lines).toContain('some-other-gha-creds-file.json');
  });

  it('handles file system errors gracefully', async () => {
    // Try to update gitignore in a non-existent directory
    const nonExistentDir = path.join(scratchDir, 'non-existent');

    // This should not throw an error
    await expect(updateGitignore(nonExistentDir)).resolves.toBeUndefined();
  });

  it('handles permission errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const fsModule = await import('node:fs');
    const writeFileSpy = vi
      .spyOn(fsModule.promises, 'writeFile')
      .mockRejectedValue(new Error('Permission denied'));

    await expect(updateGitignore(scratchDir)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to update .gitignore:',
      expect.any(Error),
    );

    writeFileSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
