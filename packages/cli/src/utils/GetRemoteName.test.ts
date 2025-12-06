/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRemoteName } from './GetRemoteName';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('getRemoteName', () => {
  let mockShellRunner: vi.Mock;

  beforeEach(() => {
    mockShellRunner = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return the remote name when the git URL is found', async () => {
    mockShellRunner.mockResolvedValueOnce({
      stdout: `origin\thttps://github.com/user/repo.git (fetch)\norigin\thttps://github.com/user/repo.git (push)\nupstream\thttps://github.com/another/repo.git (fetch)`,
      stderr: '',
      error: null,
      exitCode: 0,
      signal: null,
      backgroundPIDs: null,
      processGroupPGID: null,
    });
    const result = await getRemoteName(
      'https://github.com/user/repo.git',
      mockShellRunner,
    );
    expect(result).toBe('origin');
    expect(mockShellRunner).toHaveBeenCalledWith(
      'git remote -v',
      'Listing git remotes',
    );
  });

  it('should return undefined when the git URL is not found', async () => {
    mockShellRunner.mockResolvedValueOnce({
      stdout: `origin\thttps://github.com/user/repo.git (fetch)\n`,
      stderr: '',
      error: null,
      exitCode: 0,
      signal: null,
      backgroundPIDs: null,
      processGroupPGID: null,
    });
    const result = await getRemoteName(
      'https://github.com/nonexistent/repo.git',
      mockShellRunner,
    );
    expect(result).toBeUndefined();
    expect(mockShellRunner).toHaveBeenCalledWith(
      'git remote -v',
      'Listing git remotes',
    );
  });

  it('should return undefined when git command fails', async () => {
    mockShellRunner.mockRejectedValueOnce(new Error('git command failed'));
    const result = await getRemoteName(
      'https://github.com/user/repo.git',
      mockShellRunner,
    );
    expect(result).toBeUndefined();
    expect(mockShellRunner).toHaveBeenCalledWith(
      'git remote -v',
      'Listing git remotes',
    );
  });

  it('should return the correct remote name for the exact URL (push vs fetch)', async () => {
    mockShellRunner.mockResolvedValueOnce({
      stdout: `origin\thttps://github.com/user/repo.git (fetch)\norigin\thttps://github.com/user/repo.git (push)`,
      stderr: '',
      error: null,
      exitCode: 0,
      signal: null,
      backgroundPIDs: null,
      processGroupPGID: null,
    });
    const result = await getRemoteName(
      'https://github.com/user/repo.git',
      mockShellRunner,
    );
    expect(result).toBe('origin');
    expect(mockShellRunner).toHaveBeenCalledWith(
      'git remote -v',
      'Listing git remotes',
    );
  });

  it('should handle empty git remote output', async () => {
    mockShellRunner.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      error: null,
      exitCode: 0,
      signal: null,
      backgroundPIDs: null,
      processGroupPGID: null,
    });
    const result = await getRemoteName(
      'https://github.com/user/repo.git',
      mockShellRunner,
    );
    expect(result).toBeUndefined();
    expect(mockShellRunner).toHaveBeenCalledWith(
      'git remote -v',
      'Listing git remotes',
    );
  });
});
