/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cloneFromGit,
  tryParseGithubUrl,
  fetchReleaseFromGithub,
  checkForExtensionUpdate,
  downloadFromGitHubRelease,
  findReleaseAsset,
  downloadFile,
  extractFile,
} from './github.js';
import { simpleGit, type SimpleGit } from 'simple-git';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as tar from 'tar';
import * as extract from 'extract-zip';
import type { ExtensionManager } from '../extension-manager.js';
import { fetchJson } from './github_fetch.js';
import { EventEmitter } from 'node:events';
import type {
  GeminiCLIExtension,
  ExtensionInstallMetadata,
} from '@google/gemini-cli-core';
import type { ExtensionConfig } from '../extension.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Storage: {
      getGlobalSettingsPath: vi.fn().mockReturnValue('/mock/settings.json'),
      getGlobalGeminiDir: vi.fn().mockReturnValue('/mock/.gemini'),
    },
    debugLogger: {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
  };
});

vi.mock('simple-git');
vi.mock('node:os');
vi.mock('node:fs');
vi.mock('node:https');
vi.mock('tar');
vi.mock('extract-zip');
vi.mock('./github_fetch.js');
vi.mock('../extension-manager.js');
// Mock settings.ts to avoid top-level side effects if possible, or just rely on Storage mock
vi.mock('../settings.js', () => ({
  loadSettings: vi.fn(),
  USER_SETTINGS_PATH: '/mock/settings.json',
}));

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
      listRemote: ReturnType<typeof vi.fn>;
      revparse: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockGit = {
        clone: vi.fn(),
        getRemotes: vi.fn(),
        fetch: vi.fn(),
        checkout: vi.fn(),
        listRemote: vi.fn(),
        revparse: vi.fn(),
      };
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as SimpleGit);
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
        cloneFromGit({ type: 'git', source: 'src' }, '/dest'),
      ).rejects.toThrow('Unable to find any remotes');
    });

    it('should throw on clone error', async () => {
      mockGit.clone.mockRejectedValue(new Error('Clone failed'));

      await expect(
        cloneFromGit({ type: 'git', source: 'src' }, '/dest'),
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

    it('should handle pre-releases if allowed', async () => {
      vi.mocked(fetchJson).mockResolvedValueOnce([{ tag_name: 'v1.0.0-beta' }]);

      const result = await fetchReleaseFromGithub(
        'owner',
        'repo',
        undefined,
        true,
      );

      expect(result).toEqual({ tag_name: 'v1.0.0-beta' });
    });

    it('should return null if no releases found', async () => {
      vi.mocked(fetchJson).mockResolvedValueOnce([]);

      const result = await fetchReleaseFromGithub(
        'owner',
        'repo',
        undefined,
        true,
      );

      expect(result).toBeNull();
    });
  });

  describe('checkForExtensionUpdate', () => {
    let mockExtensionManager: ExtensionManager;
    let mockGit: {
      getRemotes: ReturnType<typeof vi.fn>;
      listRemote: ReturnType<typeof vi.fn>;
      revparse: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockExtensionManager = {
        loadExtensionConfig: vi.fn(),
      } as unknown as ExtensionManager;
      mockGit = {
        getRemotes: vi.fn(),
        listRemote: vi.fn(),
        revparse: vi.fn(),
      };
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as SimpleGit);
    });

    it('should return NOT_UPDATABLE for non-git/non-release extensions', async () => {
      vi.mocked(mockExtensionManager.loadExtensionConfig).mockReturnValue(
        Promise.resolve({
          version: '1.0.0',
        } as unknown as ExtensionConfig),
      );

      const linkExt = {
        installMetadata: { type: 'link' },
      } as unknown as GeminiCLIExtension;
      expect(await checkForExtensionUpdate(linkExt, mockExtensionManager)).toBe(
        ExtensionUpdateState.NOT_UPDATABLE,
      );
    });

    it('should return UPDATE_AVAILABLE if git remote hash differs', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'url' } },
      ]);
      mockGit.listRemote.mockResolvedValue('remote-hash\tHEAD');
      mockGit.revparse.mockResolvedValue('local-hash');

      const ext = {
        path: '/path',
        installMetadata: { type: 'git', source: 'url' },
      } as unknown as GeminiCLIExtension;
      expect(await checkForExtensionUpdate(ext, mockExtensionManager)).toBe(
        ExtensionUpdateState.UPDATE_AVAILABLE,
      );
    });

    it('should return UP_TO_DATE if git remote hash matches', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'url' } },
      ]);
      mockGit.listRemote.mockResolvedValue('hash\tHEAD');
      mockGit.revparse.mockResolvedValue('hash');

      const ext = {
        path: '/path',
        installMetadata: { type: 'git', source: 'url' },
      } as unknown as GeminiCLIExtension;
      expect(await checkForExtensionUpdate(ext, mockExtensionManager)).toBe(
        ExtensionUpdateState.UP_TO_DATE,
      );
    });

    it('should return NOT_UPDATABLE if local extension config cannot be loaded', async () => {
      vi.mocked(mockExtensionManager.loadExtensionConfig).mockImplementation(
        () => {
          throw new Error('Config not found');
        },
      );

      const ext = {
        name: 'local-ext',
        version: '1.0.0',
        path: '/path/to/installed/ext',
        installMetadata: { type: 'local', source: '/path/to/source/ext' },
      } as unknown as GeminiCLIExtension;

      expect(await checkForExtensionUpdate(ext, mockExtensionManager)).toBe(
        ExtensionUpdateState.NOT_UPDATABLE,
      );
    });
  });

  describe('downloadFromGitHubRelease', () => {
    it('should fail if no release data found', async () => {
      // Mock fetchJson to throw for latest release check
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

    it('should use correct headers for release assets', async () => {
      vi.mocked(fetchJson).mockResolvedValue({
        tag_name: 'v1.0.0',
        assets: [{ name: 'asset.tar.gz', url: 'http://asset.url' }],
      });
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.arch).mockReturnValue('x64');

      // Mock https.get and fs.createWriteStream for downloadFile
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

      // Mock fs.promises.readdir to return empty array (no cleanup needed)
      vi.mocked(fs.promises.readdir).mockResolvedValue([]);
      // Mock fs.promises.unlink
      vi.mocked(fs.promises.unlink).mockResolvedValue(undefined);

      const promise = downloadFromGitHubRelease(
        {
          type: 'github-release',
          source: 'owner/repo',
          ref: 'v1.0.0',
        } as unknown as ExtensionInstallMetadata,
        '/dest',
        { owner: 'owner', repo: 'repo' },
      );

      // Wait for downloadFile to be called and stream to be created
      await vi.waitUntil(
        () => vi.mocked(fs.createWriteStream).mock.calls.length > 0,
      );

      // Trigger stream events to complete download
      mockRes.emit('end');
      mockStream.emit('finish');

      await promise;

      expect(https.get).toHaveBeenCalledWith(
        'http://asset.url',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/octet-stream',
          }),
        }),
        expect.anything(),
      );
    });

    it('should use correct headers for source tarballs', async () => {
      vi.mocked(fetchJson).mockResolvedValue({
        tag_name: 'v1.0.0',
        assets: [],
        tarball_url: 'http://tarball.url',
      });

      // Mock https.get and fs.createWriteStream for downloadFile
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

      // Mock fs.promises.readdir to return empty array
      vi.mocked(fs.promises.readdir).mockResolvedValue([]);
      // Mock fs.promises.unlink
      vi.mocked(fs.promises.unlink).mockResolvedValue(undefined);

      const promise = downloadFromGitHubRelease(
        {
          type: 'github-release',
          source: 'owner/repo',
          ref: 'v1.0.0',
        } as unknown as ExtensionInstallMetadata,
        '/dest',
        { owner: 'owner', repo: 'repo' },
      );

      // Wait for downloadFile to be called and stream to be created
      await vi.waitUntil(
        () => vi.mocked(fs.createWriteStream).mock.calls.length > 0,
      );

      // Trigger stream events to complete download
      mockRes.emit('end');
      mockStream.emit('finish');

      await promise;

      expect(https.get).toHaveBeenCalledWith(
        'http://tarball.url',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github+json',
          }),
        }),
        expect.anything(),
      );
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

    it('should fail on non-200 status', async () => {
      const mockReq = new EventEmitter();
      const mockRes =
        new EventEmitter() as unknown as import('node:http').IncomingMessage;
      Object.assign(mockRes, { statusCode: 404 });

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') {
          cb = options;
        }
        if (cb) cb(mockRes);
        return mockReq as unknown as import('node:http').ClientRequest;
      });

      await expect(downloadFile('url', '/dest')).rejects.toThrow(
        'Request failed with status code 404',
      );
    });

    it('should follow redirects', async () => {
      const mockReq = new EventEmitter();
      const mockResRedirect =
        new EventEmitter() as unknown as import('node:http').IncomingMessage;
      Object.assign(mockResRedirect, {
        statusCode: 302,
        headers: { location: 'new-url' },
      });

      const mockResSuccess =
        new EventEmitter() as unknown as import('node:http').IncomingMessage;
      Object.assign(mockResSuccess, { statusCode: 200, pipe: vi.fn() });

      vi.mocked(https.get)
        .mockImplementationOnce((url, options, cb) => {
          if (typeof options === 'function') cb = options;
          if (cb) cb(mockResRedirect);
          return mockReq as unknown as import('node:http').ClientRequest;
        })
        .mockImplementationOnce((url, options, cb) => {
          if (typeof options === 'function') cb = options;
          if (cb) cb(mockResSuccess);
          return mockReq as unknown as import('node:http').ClientRequest;
        });

      const mockStream = new EventEmitter() as unknown as fs.WriteStream;
      Object.assign(mockStream, { close: vi.fn((cb) => cb && cb()) });
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile('url', '/dest');
      mockResSuccess.emit('end');
      mockStream.emit('finish');

      await expect(promise).resolves.toBeUndefined();
      expect(https.get).toHaveBeenCalledTimes(2);
      expect(https.get).toHaveBeenLastCalledWith(
        'new-url',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should fail after too many redirects', async () => {
      const mockReq = new EventEmitter();
      const mockResRedirect =
        new EventEmitter() as unknown as import('node:http').IncomingMessage;
      Object.assign(mockResRedirect, {
        statusCode: 302,
        headers: { location: 'new-url' },
      });

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockResRedirect);
        return mockReq as unknown as import('node:http').ClientRequest;
      });

      await expect(downloadFile('url', '/dest')).rejects.toThrow(
        'Too many redirects',
      );
    }, 10000); // Increase timeout for this test if needed, though with mocks it should be fast

    it('should fail if redirect location is missing', async () => {
      const mockReq = new EventEmitter();
      const mockResRedirect =
        new EventEmitter() as unknown as import('node:http').IncomingMessage;
      Object.assign(mockResRedirect, {
        statusCode: 302,
        headers: {}, // No location
      });

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockResRedirect);
        return mockReq as unknown as import('node:http').ClientRequest;
      });

      await expect(downloadFile('url', '/dest')).rejects.toThrow(
        'Redirect response missing Location header',
      );
    });

    it('should pass custom headers', async () => {
      const mockReq = new EventEmitter();
      const mockRes =
        new EventEmitter() as unknown as import('node:http').IncomingMessage;
      Object.assign(mockRes, { statusCode: 200, pipe: vi.fn() });

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as import('node:http').ClientRequest;
      });

      const mockStream = new EventEmitter() as unknown as fs.WriteStream;
      Object.assign(mockStream, { close: vi.fn((cb) => cb && cb()) });
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile('url', '/dest', {
        headers: { 'X-Custom': 'value' },
      });
      mockRes.emit('end');
      mockStream.emit('finish');

      await expect(promise).resolves.toBeUndefined();
      expect(https.get).toHaveBeenCalledWith(
        'url',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Custom': 'value' }),
        }),
        expect.anything(),
      );
    });
  });

  describe('extractFile', () => {
    it('should extract tar.gz using tar', async () => {
      await extractFile('file.tar.gz', '/dest');
      expect(tar.x).toHaveBeenCalled();
    });

    it('should extract zip using extract-zip', async () => {
      vi.mocked(extract.default || extract).mockResolvedValue(undefined);
      await extractFile('file.zip', '/dest');
      // Check if extract was called. Note: extract-zip export might be default or named depending on mock
    });

    it('should throw for unsupported extensions', async () => {
      await expect(extractFile('file.txt', '/dest')).rejects.toThrow(
        'Unsupported file extension',
      );
    });
  });
});
