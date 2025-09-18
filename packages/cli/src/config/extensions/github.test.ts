/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkForExtensionUpdate,
  cloneFromGit,
  findReleaseAsset,
  parseGitHubRepoForReleases,
} from './github.js';
import { simpleGit, type SimpleGit } from 'simple-git';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import type * as os from 'node:os';
import type { GeminiCLIExtension } from '@google/gemini-cli-core';

const mockPlatform = vi.hoisted(() => vi.fn());
const mockArch = vi.hoisted(() => vi.fn());
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    platform: mockPlatform,
    arch: mockArch,
  };
});

vi.mock('simple-git');

describe('git extension helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cloneFromGit', () => {
    const mockGit = {
      clone: vi.fn(),
      getRemotes: vi.fn(),
      fetch: vi.fn(),
      checkout: vi.fn(),
    };

    beforeEach(() => {
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as SimpleGit);
    });

    it('should clone, fetch and checkout a repo', async () => {
      const installMetadata = {
        source: 'http://my-repo.com',
        ref: 'my-ref',
        type: 'git' as const,
      };
      const destination = '/dest';
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'http://my-repo.com' } },
      ]);

      await cloneFromGit(installMetadata, destination);

      expect(mockGit.clone).toHaveBeenCalledWith('http://my-repo.com', './', [
        '--depth',
        '1',
      ]);
      expect(mockGit.getRemotes).toHaveBeenCalledWith(true);
      expect(mockGit.fetch).toHaveBeenCalledWith('origin', 'my-ref');
      expect(mockGit.checkout).toHaveBeenCalledWith('FETCH_HEAD');
    });

    it('should use HEAD if ref is not provided', async () => {
      const installMetadata = {
        source: 'http://my-repo.com',
        type: 'git' as const,
      };
      const destination = '/dest';
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'http://my-repo.com' } },
      ]);

      await cloneFromGit(installMetadata, destination);

      expect(mockGit.fetch).toHaveBeenCalledWith('origin', 'HEAD');
    });

    it('should throw if no remotes are found', async () => {
      const installMetadata = {
        source: 'http://my-repo.com',
        type: 'git' as const,
      };
      const destination = '/dest';
      mockGit.getRemotes.mockResolvedValue([]);

      await expect(cloneFromGit(installMetadata, destination)).rejects.toThrow(
        'Failed to clone Git repository from http://my-repo.com',
      );
    });

    it('should throw on clone error', async () => {
      const installMetadata = {
        source: 'http://my-repo.com',
        type: 'git' as const,
      };
      const destination = '/dest';
      mockGit.clone.mockRejectedValue(new Error('clone failed'));

      await expect(cloneFromGit(installMetadata, destination)).rejects.toThrow(
        'Failed to clone Git repository from http://my-repo.com',
      );
    });
  });

  describe('checkForExtensionUpdate', () => {
    const mockGit = {
      getRemotes: vi.fn(),
      listRemote: vi.fn(),
      revparse: vi.fn(),
    };

    beforeEach(() => {
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as SimpleGit);
    });

    it('should return NOT_UPDATABLE for non-git extensions', async () => {
      const extension: GeminiCLIExtension = {
        name: 'test',
        path: '/ext',
        version: '1.0.0',
        isActive: true,
        installMetadata: {
          type: 'local',
          source: '',
        },
      };
      let result: ExtensionUpdateState | undefined = undefined;
      await checkForExtensionUpdate(
        extension,
        (newState) => (result = newState),
      );
      expect(result).toBe(ExtensionUpdateState.NOT_UPDATABLE);
    });

    it('should return ERROR if no remotes found', async () => {
      const extension: GeminiCLIExtension = {
        name: 'test',
        path: '/ext',
        version: '1.0.0',
        isActive: true,
        installMetadata: {
          type: 'git',
          source: '',
        },
      };
      mockGit.getRemotes.mockResolvedValue([]);
      let result: ExtensionUpdateState | undefined = undefined;
      await checkForExtensionUpdate(
        extension,
        (newState) => (result = newState),
      );
      expect(result).toBe(ExtensionUpdateState.ERROR);
    });

    it('should return UPDATE_AVAILABLE when remote hash is different', async () => {
      const extension: GeminiCLIExtension = {
        name: 'test',
        path: '/ext',
        version: '1.0.0',
        isActive: true,
        installMetadata: {
          type: 'git',
          source: 'my/ext',
        },
      };
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'http://my-repo.com' } },
      ]);
      mockGit.listRemote.mockResolvedValue('remote-hash\tHEAD');
      mockGit.revparse.mockResolvedValue('local-hash');

      let result: ExtensionUpdateState | undefined = undefined;
      await checkForExtensionUpdate(
        extension,
        (newState) => (result = newState),
      );
      expect(result).toBe(ExtensionUpdateState.UPDATE_AVAILABLE);
    });

    it('should return UP_TO_DATE when remote and local hashes are the same', async () => {
      const extension: GeminiCLIExtension = {
        name: 'test',
        path: '/ext',
        version: '1.0.0',
        isActive: true,
        installMetadata: {
          type: 'git',
          source: 'my/ext',
        },
      };
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'http://my-repo.com' } },
      ]);
      mockGit.listRemote.mockResolvedValue('same-hash\tHEAD');
      mockGit.revparse.mockResolvedValue('same-hash');

      let result: ExtensionUpdateState | undefined = undefined;
      await checkForExtensionUpdate(
        extension,
        (newState) => (result = newState),
      );
      expect(result).toBe(ExtensionUpdateState.UP_TO_DATE);
    });

    it('should return ERROR on git error', async () => {
      const extension: GeminiCLIExtension = {
        name: 'test',
        path: '/ext',
        version: '1.0.0',
        isActive: true,
        installMetadata: {
          type: 'git',
          source: 'my/ext',
        },
      };
      mockGit.getRemotes.mockRejectedValue(new Error('git error'));

      let result: ExtensionUpdateState | undefined = undefined;
      await checkForExtensionUpdate(
        extension,
        (newState) => (result = newState),
      );
      expect(result).toBe(ExtensionUpdateState.ERROR);
    });
  });

  describe('findReleaseAsset', () => {
    const assets = [
      { name: 'darwin.arm64.extension.tar.gz', browser_download_url: 'url1' },
      { name: 'darwin.x64.extension.tar.gz', browser_download_url: 'url2' },
      { name: 'linux.x64.extension.tar.gz', browser_download_url: 'url3' },
      { name: 'win32.x64.extension.tar.gz', browser_download_url: 'url4' },
      { name: 'extension-generic.tar.gz', browser_download_url: 'url5' },
    ];

    it('should find asset matching platform and architecture', () => {
      mockPlatform.mockReturnValue('darwin');
      mockArch.mockReturnValue('arm64');
      const result = findReleaseAsset(assets);
      expect(result).toEqual(assets[0]);
    });

    it('should find asset matching platform if arch does not match', () => {
      mockPlatform.mockReturnValue('linux');
      mockArch.mockReturnValue('arm64');
      const result = findReleaseAsset(assets);
      expect(result).toEqual(assets[2]);
    });

    it('should return undefined if no matching asset is found', () => {
      mockPlatform.mockReturnValue('sunos');
      mockArch.mockReturnValue('x64');
      const result = findReleaseAsset(assets);
      expect(result).toBeUndefined();
    });

    it('should find generic asset if it is the only one', () => {
      const singleAsset = [
        { name: 'extension.tar.gz', browser_download_url: 'url' },
      ];
      mockPlatform.mockReturnValue('darwin');
      mockArch.mockReturnValue('arm64');
      const result = findReleaseAsset(singleAsset);
      expect(result).toEqual(singleAsset[0]);
    });

    it('should return undefined if multiple generic assets exist', () => {
      const multipleGenericAssets = [
        { name: 'extension-1.tar.gz', browser_download_url: 'url1' },
        { name: 'extension-2.tar.gz', browser_download_url: 'url2' },
      ];
      mockPlatform.mockReturnValue('darwin');
      mockArch.mockReturnValue('arm64');
      const result = findReleaseAsset(multipleGenericAssets);
      expect(result).toBeUndefined();
    });
  });

  describe('parseGitHubRepoForReleases', () => {
    it('should parse owner and repo from a full GitHub URL', () => {
      const source = 'https://github.com/owner/repo.git';
      const { owner, repo } = parseGitHubRepoForReleases(source);
      expect(owner).toBe('owner');
      expect(repo).toBe('repo');
    });

    it('should parse owner and repo from a full GitHub UR without .git', () => {
      const source = 'https://github.com/owner/repo';
      const { owner, repo } = parseGitHubRepoForReleases(source);
      expect(owner).toBe('owner');
      expect(repo).toBe('repo');
    });

    it('should fail on a GitHub SSH URL', () => {
      const source = 'git@github.com:owner/repo.git';
      expect(() => parseGitHubRepoForReleases(source)).toThrow(
        'GitHub release-based extensions are not supported for SSH. You must use an HTTPS URI with a personal access token to download releases from private repositories. You can set your personal access token in the GITHUB_TOKEN environment variable and install the extension via SSH.',
      );
    });

    it('should parse owner and repo from a shorthand string', () => {
      const source = 'owner/repo';
      const { owner, repo } = parseGitHubRepoForReleases(source);
      expect(owner).toBe('owner');
      expect(repo).toBe('repo');
    });

    it('should handle .git suffix in repo name', () => {
      const source = 'owner/repo.git';
      const { owner, repo } = parseGitHubRepoForReleases(source);
      expect(owner).toBe('owner');
      expect(repo).toBe('repo');
    });

    it('should throw error for invalid source format', () => {
      const source = 'invalid-format';
      expect(() => parseGitHubRepoForReleases(source)).toThrow(
        'Invalid GitHub repository source: invalid-format. Expected "owner/repo" or a github repo uri.',
      );
    });

    it('should throw error for source with too many parts', () => {
      const source = 'https://github.com/owner/repo/extra';
      expect(() => parseGitHubRepoForReleases(source)).toThrow(
        'Invalid GitHub repository source: https://github.com/owner/repo/extra. Expected "owner/repo" or a github repo uri.',
      );
    });
  });
});
