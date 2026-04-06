/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cloneFromGit,
  tryParseGithubUrl,
  fetchReleaseFromGithub,
  downloadFromGitHubRelease,
  findReleaseAsset,
  downloadFile,
  extractFile,
} from './github.js';
import { simpleGit, type SimpleGit } from 'simple-git';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as tar from 'tar';
import extract from 'extract-zip';
import { fetchJson } from './github_fetch.js';
import { EventEmitter } from 'node:events';
import { type ExtensionInstallMetadata } from '../config/config.js';

vi.mock('simple-git');
vi.mock('node:os');
vi.mock('node:fs');
vi.mock('node:https');
vi.mock('tar');
vi.mock('extract-zip');
vi.mock('./github_fetch.js');

describe('github.ts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('cloneFromGit', () => {
    let mockGit: {
      clone: ReturnType<typeof vi.fn>;
      getRemotes: ReturnType<typeof vi.fn>;
      fetch: ReturnType<typeof vi.fn>;
      checkout: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockGit = {
        clone: vi.fn(),
        getRemotes: vi.fn(),
        fetch: vi.fn(),
        checkout: vi.fn(),
      };
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as SimpleGit);
      // Mock destination directory existence check in simple-git if needed, 
      // but here we are mocking simpleGit itself.
    });

    it('should clone, fetch and checkout a repo', async () => {
      mockGit.getRemotes.mockResolvedValue([{ name: 'origin' }]);

      await cloneFromGit(
        {
          type: 'git',
          source: 'https://github.com/owner/repo.git',
          ref: 'v1.0.0',
        },
        '/dest',
      );

      expect(mockGit.clone).toHaveBeenCalledWith(
        'https://github.com/owner/repo.git',
        './',
        ['--depth', '1'],
      );
      expect(mockGit.fetch).toHaveBeenCalledWith('origin', 'v1.0.0');
      expect(mockGit.checkout).toHaveBeenCalledWith('FETCH_HEAD');
    });

    it('should throw if no remotes found', async () => {
      mockGit.getRemotes.mockResolvedValue([]);

      await expect(
        cloneFromGit({ type: 'git', source: 'src' } as ExtensionInstallMetadata, '/dest'),
      ).rejects.toThrow('Unable to find any remotes');
    });

    it('should throw on clone error', async () => {
      mockGit.clone.mockRejectedValue(new Error('Clone failed'));

      await expect(
        cloneFromGit({ type: 'git', source: 'src' } as ExtensionInstallMetadata, '/dest'),
      ).rejects.toThrow('Failed to clone Git repository');
    });
  });

  describe('tryParseGithubUrl', () => {
    it.each([
      ['https://github.com/owner/repo', 'owner', 'repo'],
      ['https://github.com/owner/repo.git', 'owner', 'repo'],
      ['git@github.com:owner/repo.git', 'owner', 'repo'],
      ['owner/repo', 'owner', 'repo'],
    ])('should parse %s to %s/%s', (url, owner, repo) => {
      expect(tryParseGithubUrl(url)).toEqual({ owner, repo });
    });

    it.each([
      'https://gitlab.com/owner/repo',
      'https://my-git-host.com/owner/group/repo',
      'git@gitlab.com:some-group/some-project/some-repo.git',
    ])('should return null for non-GitHub URLs', (url) => {
      expect(tryParseGithubUrl(url)).toBeNull();
    });

    it('should throw for invalid formats', () => {
      expect(() => tryParseGithubUrl('invalid')).toThrow(
        'Invalid GitHub repository source',
      );
    });
  });

  describe('fetchReleaseFromGithub', () => {
    it('should fetch latest release if no ref provided', async () => {
      vi.mocked(fetchJson).mockResolvedValue({ tag_name: 'v1.0.0' });

      await fetchReleaseFromGithub('owner', 'repo');

      expect(fetchJson).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/releases/latest',
      );
    });

    it('should fetch specific ref if provided', async () => {
      vi.mocked(fetchJson).mockResolvedValue({ tag_name: 'v1.0.0' });

      await fetchReleaseFromGithub('owner', 'repo', 'v1.0.0');

      expect(fetchJson).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/releases/tags/v1.0.0',
      );
    });
  });

  describe('downloadFromGitHubRelease', () => {
    it('should fail if no release data found', async () => {
      vi.mocked(fetchJson).mockRejectedValue(new Error('Not found'));

      const result = await downloadFromGitHubRelease(
        {
          type: 'github-release',
          source: 'owner/repo',
          ref: 'v1',
        } as unknown as ExtensionInstallMetadata,
        '/dest',
        { owner: 'owner', repo: 'repo' },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.failureReason).toBe('failed to fetch release data');
      }
    });
  });

  describe('findReleaseAsset', () => {
    it('should find platform/arch specific asset', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.arch).mockReturnValue('arm64');
      const assets = [
        { name: 'darwin.arm64.tar.gz', url: 'url1' },
        { name: 'linux.x64.tar.gz', url: 'url2' },
      ];
      expect(findReleaseAsset(assets)).toEqual(assets[0]);
    });

    it('should find generic asset', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      const assets = [{ name: 'generic.tar.gz', url: 'url' }];
      expect(findReleaseAsset(assets)).toEqual(assets[0]);
    });
  });

  describe('downloadFile', () => {
    it('should download file successfully', async () => {
      const mockReq = new EventEmitter();
      const mockRes =
        new EventEmitter() as unknown as import('node:http').IncomingMessage;
      Object.assign(mockRes, { statusCode: 200, pipe: vi.fn() });

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') {
          cb = options;
        }
        if (cb) cb(mockRes);
        return mockReq as unknown as import('node:http').ClientRequest;
      });

      const mockStream = new EventEmitter() as unknown as fs.WriteStream;
      Object.assign(mockStream, { close: vi.fn((cb) => cb && cb()) });
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile('url', '/dest');
      mockRes.emit('end');
      mockStream.emit('finish');

      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('extractFile', () => {
    it('should extract tar.gz using tar', async () => {
      await extractFile('file.tar.gz', '/dest');
      expect(tar.x).toHaveBeenCalled();
    });

    it('should extract zip using extract-zip', async () => {
      vi.mocked(extract).mockResolvedValue(undefined);
      await extractFile('file.zip', '/dest');
      expect(extract).toHaveBeenCalled();
    });
  });
});
