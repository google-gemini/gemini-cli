/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, expect, it, afterEach, beforeEach } from 'vitest';
import * as child_process from 'node:child_process';
import {
  isGitHubRepository,
  getGitRepoRoot,
  getLatestGitHubRelease,
  getGitHubRepoInfo,
} from './gitUtils.js';

vi.mock('child_process');

describe('isGitHubRepository', async () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false if the git command fails', async () => {
    vi.mocked(child_process.execSync).mockImplementation((): string => {
      throw new Error('oops');
    });
    expect(isGitHubRepository()).toBe(false);
  });

  it('returns false if the remote is not github.com', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce('https://gitlab.com');
    expect(isGitHubRepository()).toBe(false);
  });

  it('returns true if the remote is github.com', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(`
      origin  https://github.com/sethvargo/gemini-cli (fetch)
      origin  https://github.com/sethvargo/gemini-cli (push)
    `);
    expect(isGitHubRepository()).toBe(true);
  });
});

describe('getGitHubRepoInfo', async () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if github repo info cannot be determined', async () => {
    vi.mocked(child_process.execSync).mockImplementation((): string => {
      throw new Error('oops');
    });
    expect(() => {
      getGitHubRepoInfo();
    }).toThrowError(/oops/);
  });

  it('throws an error if owner/repo could not be determined', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce('');
    expect(() => {
      getGitHubRepoInfo();
    }).toThrowError(/Owner & repo could not be extracted from remote URL/);
  });

  it('returns the owner and repo', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'https://github.com/owner/repo.git ',
    );
    expect(getGitHubRepoInfo()).toEqual({ owner: 'owner', repo: 'repo' });
  });

  // --- Tests for credential formats ---

  it('returns the owner and repo for URL with classic PAT token (ghp_)', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'https://ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@github.com/owner/repo.git',
    );
    expect(getGitHubRepoInfo()).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('returns the owner and repo for URL with fine-grained PAT token (github_pat_)', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'https://github_pat_xxxxxxxxxxxxxxxxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@github.com/owner/repo.git',
    );
    expect(getGitHubRepoInfo()).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('returns the owner and repo for URL with username:password format', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'https://username:password@github.com/owner/repo.git',
    );
    expect(getGitHubRepoInfo()).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('returns the owner and repo for URL with OAuth token (oauth2:token)', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'https://oauth2:gho_xxxxxxxxxxxx@github.com/owner/repo.git',
    );
    expect(getGitHubRepoInfo()).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('returns the owner and repo for URL with GitHub Actions token (x-access-token)', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'https://x-access-token:ghs_xxxxxxxxxxxx@github.com/owner/repo.git',
    );
    expect(getGitHubRepoInfo()).toEqual({ owner: 'owner', repo: 'repo' });
  });

  // --- Tests for case insensitivity ---

  it('returns the owner and repo for URL with uppercase GITHUB.COM', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'https://GITHUB.COM/owner/repo.git',
    );
    expect(getGitHubRepoInfo()).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('returns the owner and repo for URL with mixed case GitHub.Com', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'https://GitHub.Com/owner/repo.git',
    );
    expect(getGitHubRepoInfo()).toEqual({ owner: 'owner', repo: 'repo' });
  });

  // --- Tests for SSH format ---

  it('returns the owner and repo for SSH URL', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'git@github.com:owner/repo.git',
    );
    expect(getGitHubRepoInfo()).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('throws for non-GitHub SSH URL', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'git@gitlab.com:owner/repo.git',
    );
    expect(() => {
      getGitHubRepoInfo();
    }).toThrowError(/Owner & repo could not be extracted from remote URL/);
  });

  // --- Tests for edge cases ---

  it('returns the owner and repo for URL without .git suffix', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'https://github.com/owner/repo',
    );
    expect(getGitHubRepoInfo()).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('throws for non-GitHub HTTPS URL', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'https://gitlab.com/owner/repo.git',
    );
    expect(() => {
      getGitHubRepoInfo();
    }).toThrowError(/Owner & repo could not be extracted from remote URL/);
  });

  it('handles repo names containing .git substring', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce(
      'https://github.com/owner/my.git.repo.git',
    );
    expect(getGitHubRepoInfo()).toEqual({
      owner: 'owner',
      repo: 'my.git.repo',
    });
  });
});

describe('getGitRepoRoot', async () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if git root cannot be determined', async () => {
    vi.mocked(child_process.execSync).mockImplementation((): string => {
      throw new Error('oops');
    });
    expect(() => {
      getGitRepoRoot();
    }).toThrowError(/oops/);
  });

  it('throws an error if git root is empty', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce('');
    expect(() => {
      getGitRepoRoot();
    }).toThrowError(/Git repo returned empty value/);
  });

  it('returns the root', async () => {
    vi.mocked(child_process.execSync).mockReturnValueOnce('/path/to/git/repo');
    expect(getGitRepoRoot()).toBe('/path/to/git/repo');
  });
});

describe('getLatestRelease', async () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws an error if the fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.reject('nope'));
    await expect(getLatestGitHubRelease()).rejects.toThrowError(
      /Unable to determine the latest/,
    );
  });

  it('throws an error if the fetch does not return a json body', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ foo: 'bar' }),
      } as Response),
    );
    await expect(getLatestGitHubRelease()).rejects.toThrowError(
      /Unable to determine the latest/,
    );
  });

  it('returns the release version', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tag_name: 'v1.2.3' }),
      } as Response),
    );
    await expect(getLatestGitHubRelease()).resolves.toBe('v1.2.3');
  });
});
