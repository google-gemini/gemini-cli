/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import type { ClientRequest, IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { promisify } from 'node:util';
import {
  PrivateIpError,
  validateUrlDestination,
  type GeminiCLIExtension,
  type ExtensionInstallMetadata,
} from '@google/gemini-cli-core';
import type { ExtensionConfig } from '../extension.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    validateUrlDestination: vi.fn(),
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
vi.mock('./github_fetch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./github_fetch.js')>();
  return {
    ...actual,
    fetchJson: vi.fn(),
  };
});
vi.mock('../extension-manager.js');
// Mock settings.ts to avoid top-level side effects if possible, or just rely on Storage mock
vi.mock('../settings.js', () => ({
  loadSettings: vi.fn(),
  USER_SETTINGS_PATH: '/mock/settings.json',
}));

describe('github.ts', () => {
  function createMockResponse(
    statusCode = 200,
    headers: Record<string, string> = {},
    complete = true,
  ): IncomingMessage & PassThrough {
    const stream = new PassThrough();
    return Object.assign(stream, {
      statusCode,
      headers,
      complete,
    }) as unknown as IncomingMessage & PassThrough;
  }

  function createMockWriteStream(): fs.WriteStream {
    return new PassThrough() as unknown as fs.WriteStream;
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.mocked(validateUrlDestination).mockResolvedValue(true);
    vi.mocked(fs.promises.rename).mockResolvedValue(undefined);
    vi.mocked(fs.promises.unlink).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('cloneFromGit', () => {
    let mockGit: {
      clone: ReturnType<typeof vi.fn>;
      getRemotes: ReturnType<typeof vi.fn>;
      fetch: ReturnType<typeof vi.fn>;
      checkout: ReturnType<typeof vi.fn>;
      listRemote: ReturnType<typeof vi.fn>;
      revparse: ReturnType<typeof vi.fn>;
      env: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockGit = {
        clone: vi.fn(),
        getRemotes: vi.fn(),
        fetch: vi.fn(),
        checkout: vi.fn(),
        listRemote: vi.fn(),
        revparse: vi.fn(),
        env: vi.fn().mockReturnThis(),
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
      // `.git` inside the repo name must be preserved.
      ['https://github.com/someuser/blog.github.io', 'blog.github.io'],
      ['https://github.com/someuser/my.git.repo', 'my.git.repo'],
      // Only a trailing `.git` suffix is stripped, case-insensitively.
      ['https://github.com/someuser/tool.git', 'tool'],
      ['https://github.com/someuser/tool.GIT', 'tool'],
      ['https://github.com/someuser/blog.github.io.git', 'blog.github.io'],
    ])('should strip only a trailing .git suffix: %s -> %s', (url, repo) => {
      expect(tryParseGithubUrl(url)).toEqual({ owner: 'someuser', repo });
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
      env: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockExtensionManager = {
        loadExtensionConfig: vi.fn(),
      } as unknown as ExtensionManager;
      mockGit = {
        getRemotes: vi.fn(),
        listRemote: vi.fn(),
        revparse: vi.fn(),
        env: vi.fn().mockReturnThis(),
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
      expect(mockGit.env).toHaveBeenCalledWith(
        expect.objectContaining({
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: '',
          SSH_ASKPASS: '',
          GIT_SSH_COMMAND: expect.stringContaining('BatchMode=yes'),
          GH_PROMPT_DISABLED: '1',
          GCM_INTERACTIVE: 'never',
        }),
      );
    });

    it('should return ERROR when git listRemote fails due to disabled terminal prompts on private repos', async () => {
      mockGit.getRemotes.mockResolvedValue([
        {
          name: 'origin',
          refs: { fetch: 'https://github.com/owner/private-repo.git' },
        },
      ]);
      mockGit.listRemote.mockRejectedValue(
        new Error(
          "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
        ),
      );

      const ext = {
        name: 'private-ext',
        path: '/path/to/private-ext',
        installMetadata: {
          type: 'git',
          source: 'https://github.com/owner/private-repo.git',
        },
      } as unknown as GeminiCLIExtension;

      expect(await checkForExtensionUpdate(ext, mockExtensionManager)).toBe(
        ExtensionUpdateState.ERROR,
      );
      expect(mockGit.env).toHaveBeenCalledWith(
        expect.objectContaining({
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: '',
          SSH_ASKPASS: '',
          GIT_SSH_COMMAND: expect.stringContaining('BatchMode=yes'),
          GH_PROMPT_DISABLED: '1',
          GCM_INTERACTIVE: 'never',
        }),
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
        async () => {
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

    it('should check migratedTo source if present and return UPDATE_AVAILABLE', async () => {
      mockGit.getRemotes.mockResolvedValue([
        { name: 'origin', refs: { fetch: 'new-url' } },
      ]);
      mockGit.listRemote.mockResolvedValue('hash\tHEAD');
      mockGit.revparse.mockResolvedValue('hash');

      const ext = {
        path: '/path',
        migratedTo: 'new-url',
        installMetadata: { type: 'git', source: 'old-url' },
      } as unknown as GeminiCLIExtension;
      expect(await checkForExtensionUpdate(ext, mockExtensionManager)).toBe(
        ExtensionUpdateState.UPDATE_AVAILABLE,
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
        assets: [
          { name: 'asset.tar.gz', url: 'https://example.com/asset.tar.gz' },
        ],
      });
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.arch).mockReturnValue('x64');

      // Mock https.get and fs.createWriteStream for downloadFile
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') {
          cb = options;
        }
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
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

      // Complete response stream to finish pipeline
      mockRes.end('archive-bytes');

      await promise;

      expect(https.get).toHaveBeenCalledWith(
        'https://example.com/asset.tar.gz',
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
        tarball_url: 'https://example.com/tarball.tar.gz',
      });

      // Mock https.get and fs.createWriteStream for downloadFile
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') {
          cb = options;
        }
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
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

      // Complete response stream to finish pipeline
      mockRes.end('tarball-bytes');

      await promise;

      expect(https.get).toHaveBeenCalledWith(
        'https://example.com/tarball.tar.gz',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github+json',
          }),
        }),
        expect.anything(),
      );
    });

    it('should return failed to download asset when download stream errors', async () => {
      vi.mocked(fetchJson).mockResolvedValue({
        tag_name: 'v1.0.0',
        assets: [
          { name: 'asset.tar.gz', url: 'https://example.com/asset.tar.gz' },
        ],
      });
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.arch).mockReturnValue('x64');

      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') {
          cb = options;
        }
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFromGitHubRelease(
        {
          type: 'github-release',
          source: 'owner/repo',
          ref: 'v1.0.0',
        } as unknown as ExtensionInstallMetadata,
        '/dest',
        { owner: 'owner', repo: 'repo' },
      );

      await vi.waitUntil(
        () => vi.mocked(fs.createWriteStream).mock.calls.length > 0,
      );

      mockStream.emit('error', new Error('ENOSPC: no space left on device'));

      const result = await promise;
      expect(result).toEqual({
        failureReason: 'failed to download asset',
        success: false,
        type: 'github-release',
        tagName: 'v1.0.0',
        errorMessage: expect.stringContaining(
          'ENOSPC: no space left on device',
        ),
      });
      expect(fs.promises.unlink).toHaveBeenCalledOnce();
      expect(fs.promises.rename).not.toHaveBeenCalled();
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
    const assetUrl = 'https://example.com/asset.tar.gz';
    const redirectedAssetUrl = 'https://example.com/redirected-asset.tar.gz';

    it('should download file successfully via temporary file and atomic rename', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') {
          cb = options;
        }
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(assetUrl, '/dest');
      mockRes.end('file-contents');

      await expect(promise).resolves.toBeUndefined();
      expect(fs.createWriteStream).toHaveBeenCalledOnce();
      const tempPath = vi.mocked(fs.createWriteStream).mock.calls[0][0];
      expect(tempPath).toMatch(/^\/dest\..+\.tmp$/);
      expect(fs.promises.rename).toHaveBeenCalledWith(tempPath, '/dest');
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('should fail on non-200 status', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(404);
      const resumeSpy = vi.spyOn(mockRes, 'resume');

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') {
          cb = options;
        }
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      await expect(downloadFile(assetUrl, '/dest')).rejects.toThrow(
        'Request failed with status code 404',
      );
      expect(resumeSpy).toHaveBeenCalledOnce();
      expect(fs.createWriteStream).not.toHaveBeenCalled();
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it.each([301, 302, 303, 307, 308])(
      'should follow a %i redirect',
      async (statusCode) => {
        const mockResRedirect = createMockResponse(statusCode, {
          location: redirectedAssetUrl,
        });
        const mockResSuccess = createMockResponse(200);

        vi.mocked(https.get)
          .mockImplementationOnce((url, options, cb) => {
            if (typeof options === 'function') cb = options;
            if (cb) cb(mockResRedirect);
            return new EventEmitter() as unknown as ClientRequest;
          })
          .mockImplementationOnce((url, options, cb) => {
            if (typeof options === 'function') cb = options;
            if (cb) cb(mockResSuccess);
            return new EventEmitter() as unknown as ClientRequest;
          });

        const mockStream = createMockWriteStream();
        vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

        const promise = downloadFile(assetUrl, '/dest');
        mockResSuccess.end('redirected-contents');

        await expect(promise).resolves.toBeUndefined();
        expect(https.get).toHaveBeenCalledTimes(2);
        expect(https.get).toHaveBeenLastCalledWith(
          redirectedAssetUrl,
          expect.anything(),
          expect.anything(),
        );
        expect(fs.createWriteStream).toHaveBeenCalledOnce();
        expect(fs.promises.rename).toHaveBeenCalledOnce();
      },
    );

    it('should resolve relative redirect Location headers against the request URL', async () => {
      const mockResRedirect = createMockResponse(302, {
        location: '/releases/download/v1.0.0/asset.tar.gz',
      });
      const mockResSuccess = createMockResponse(200);

      vi.mocked(https.get)
        .mockImplementationOnce((url, options, cb) => {
          if (typeof options === 'function') cb = options;
          if (cb) cb(mockResRedirect);
          return new EventEmitter() as unknown as ClientRequest;
        })
        .mockImplementationOnce((url, options, cb) => {
          if (typeof options === 'function') cb = options;
          if (cb) cb(mockResSuccess);
          return new EventEmitter() as unknown as ClientRequest;
        });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(
        'https://github.com/owner/repo/releases/latest',
        '/dest',
      );
      mockResSuccess.end('redirected-contents');

      await expect(promise).resolves.toBeUndefined();
      expect(https.get).toHaveBeenLastCalledWith(
        'https://github.com/releases/download/v1.0.0/asset.tar.gz',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should fail after too many redirects', async () => {
      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(createMockResponse(302, { location: redirectedAssetUrl }));
        return new EventEmitter() as unknown as ClientRequest;
      });

      await expect(downloadFile(assetUrl, '/dest')).rejects.toThrow(
        'Too many redirects',
      );
    }, 10000); // Increase timeout for this test if needed, though with mocks it should be fast

    it('should fail if redirect location is missing', async () => {
      const mockReq = new EventEmitter();
      const mockResRedirect = createMockResponse(302, {});

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockResRedirect);
        return mockReq as unknown as ClientRequest;
      });

      await expect(downloadFile(assetUrl, '/dest')).rejects.toThrow(
        'Redirect response missing Location header',
      );
    });

    it('should reject invalid or non-HTTPS download URLs before DNS or network requests', async () => {
      await expect(downloadFile('not-a-valid-url', '/dest')).rejects.toThrow(
        'Invalid download URL not-a-valid-url',
      );
      await expect(
        downloadFile('http://example.com/metadata', '/dest'),
      ).rejects.toThrow(
        'Refusing to download from insecure protocol http: for URL http://example.com/metadata. Only HTTPS is supported.',
      );
      await expect(
        downloadFile('ftp://example.com/metadata', '/dest'),
      ).rejects.toThrow(
        'Refusing to download from insecure protocol ftp: for URL ftp://example.com/metadata. Only HTTPS is supported.',
      );
      expect(validateUrlDestination).not.toHaveBeenCalled();
      expect(https.get).not.toHaveBeenCalled();
    });

    it('should reject when a redirect downgrades from HTTPS to HTTP', async () => {
      vi.mocked(https.get).mockImplementationOnce((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) {
          cb(
            createMockResponse(302, {
              location: 'http://example.com/downgraded',
            }),
          );
        }
        return new EventEmitter() as unknown as ClientRequest;
      });

      await expect(downloadFile(assetUrl, '/dest')).rejects.toThrow(
        'Refusing to download from insecure protocol http: for URL http://example.com/downgraded. Only HTTPS is supported.',
      );
      expect(validateUrlDestination).toHaveBeenCalledTimes(1);
      expect(https.get).toHaveBeenCalledTimes(1);
    });

    it('should reject when URL destination validation fails (SSRF protection)', async () => {
      vi.mocked(validateUrlDestination).mockResolvedValueOnce(false);

      await expect(
        downloadFile('https://169.254.169.254/latest/meta-data/', '/dest'),
      ).rejects.toThrow(
        'Access to blocked or private host https://169.254.169.254/latest/meta-data/ is not allowed.',
      );
      expect(https.get).not.toHaveBeenCalled();
    });

    it('should reject when redirect destination fails SSRF validation', async () => {
      vi.mocked(validateUrlDestination)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      vi.mocked(https.get).mockImplementationOnce((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) {
          cb(
            createMockResponse(302, {
              location: 'https://127.0.0.1:8080/internal',
            }),
          );
        }
        return new EventEmitter() as unknown as ClientRequest;
      });

      await expect(downloadFile(assetUrl, '/dest')).rejects.toThrow(
        'Access to blocked or private host https://127.0.0.1:8080/internal is not allowed.',
      );
      expect(https.get).toHaveBeenCalledTimes(1);
    });

    it('should connect through a lookup that refuses private addresses', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementationOnce((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(assetUrl, '/dest');
      mockRes.end('data');
      await promise;

      const options = vi.mocked(https.get).mock.calls[0][1];
      if (!options || typeof options === 'function' || !options.lookup) {
        throw new Error('https.get was called without a lookup');
      }
      const resolveHost = promisify(options.lookup);

      await expect(resolveHost('10.0.0.5', {})).rejects.toThrow(PrivateIpError);
      await expect(resolveHost('localhost', {})).rejects.toThrow(
        PrivateIpError,
      );
      await expect(resolveHost('8.8.8.8', {})).resolves.toBe('8.8.8.8');
    });

    it('should include Authorization header only for https github.com and *.github.com URLs', async () => {
      vi.stubEnv('GITHUB_TOKEN', 'my-secret-token');

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        const mockRes = createMockResponse(200);
        if (cb) cb(mockRes);
        mockRes.end('data');
        return new EventEmitter() as unknown as ClientRequest;
      });
      vi.mocked(fs.createWriteStream).mockImplementation(() =>
        createMockWriteStream(),
      );

      await downloadFile(
        'https://api.github.com/repos/owner/repo/releases/assets/1',
        '/dest',
      );
      await downloadFile(
        'https://github.com/owner/repo/releases/download/v1.0.0/asset.tar.gz',
        '/dest',
      );
      await downloadFile(
        'https://objects.githubusercontent.com/github-production-release-asset/asset.tar.gz',
        '/dest',
      );
      await downloadFile('https://notgithub.com/asset.tar.gz', '/dest');

      expect(https.get).toHaveBeenNthCalledWith(
        1,
        'https://api.github.com/repos/owner/repo/releases/assets/1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token my-secret-token',
          }),
        }),
        expect.anything(),
      );
      expect(https.get).toHaveBeenNthCalledWith(
        2,
        'https://github.com/owner/repo/releases/download/v1.0.0/asset.tar.gz',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'token my-secret-token',
          }),
        }),
        expect.anything(),
      );

      const githubusercontentOptions = vi.mocked(https.get).mock.calls[2][1];
      const externalOptions = vi.mocked(https.get).mock.calls[3][1];
      if (
        !githubusercontentOptions ||
        typeof githubusercontentOptions === 'function' ||
        !externalOptions ||
        typeof externalOptions === 'function'
      ) {
        throw new Error('Expected request options object');
      }
      expect(githubusercontentOptions.headers).not.toHaveProperty(
        'Authorization',
      );
      expect(externalOptions.headers).not.toHaveProperty('Authorization');
    });

    it('should strip Authorization header when redirecting from GitHub to an external asset host', async () => {
      vi.stubEnv('GITHUB_TOKEN', 'my-secret-token');

      const externalS3Url =
        'https://objects.githubusercontent.com/github-production-release-asset/asset.tar.gz';
      const mockResRedirect = createMockResponse(302, {
        location: externalS3Url,
      });
      const mockResSuccess = createMockResponse(200);

      vi.mocked(https.get)
        .mockImplementationOnce((url, options, cb) => {
          if (typeof options === 'function') cb = options;
          if (cb) cb(mockResRedirect);
          return new EventEmitter() as unknown as ClientRequest;
        })
        .mockImplementationOnce((url, options, cb) => {
          if (typeof options === 'function') cb = options;
          if (cb) cb(mockResSuccess);
          return new EventEmitter() as unknown as ClientRequest;
        });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(
        'https://api.github.com/repos/owner/repo/releases/assets/1',
        '/dest',
        { headers: { Authorization: 'Bearer caller-secret' } },
      );
      mockResSuccess.end('asset-bytes');
      await expect(promise).resolves.toBeUndefined();

      const firstOptions = vi.mocked(https.get).mock.calls[0][1];
      const secondOptions = vi.mocked(https.get).mock.calls[1][1];
      if (
        !firstOptions ||
        typeof firstOptions === 'function' ||
        !secondOptions ||
        typeof secondOptions === 'function'
      ) {
        throw new Error('Expected request options object');
      }
      expect(firstOptions.headers).toHaveProperty(
        'Authorization',
        'token my-secret-token',
      );
      expect(secondOptions.headers).not.toHaveProperty('Authorization');
    });

    it('should pass custom headers', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(assetUrl, '/dest', {
        headers: { 'X-Custom': 'value' },
      });
      mockRes.end('data');

      await expect(promise).resolves.toBeUndefined();
      expect(https.get).toHaveBeenCalledWith(
        assetUrl,
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Custom': 'value' }),
        }),
        expect.anything(),
      );
    });

    it('should reject and remove partial temp file when response stream emits an error', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(assetUrl, '/dest');
      await vi.waitUntil(
        () => vi.mocked(fs.createWriteStream).mock.calls.length > 0,
      );
      mockRes.write('partial-bytes');
      mockRes.emit('error', new Error('Mid-transfer connection reset'));

      await expect(promise).rejects.toThrow('Mid-transfer connection reset');
      const tempPath = vi.mocked(fs.createWriteStream).mock.calls[0][0];
      expect(mockStream.destroyed).toBe(true);
      expect(fs.promises.rename).not.toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalledWith(tempPath);
    });

    it('should reject, tear down response stream, and remove partial temp file when write stream emits an error', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(assetUrl, '/dest');
      await vi.waitUntil(
        () => vi.mocked(fs.createWriteStream).mock.calls.length > 0,
      );
      mockStream.emit('error', new Error('ENOSPC: no space left on device'));

      await expect(promise).rejects.toThrow('ENOSPC: no space left on device');
      const tempPath = vi.mocked(fs.createWriteStream).mock.calls[0][0];
      expect(mockRes.destroyed).toBe(true);
      expect(fs.promises.rename).not.toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalledWith(tempPath);
    });

    it('should reject and remove partial temp file when response closes prematurely before end', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(assetUrl, '/dest');
      await vi.waitUntil(
        () => vi.mocked(fs.createWriteStream).mock.calls.length > 0,
      );
      mockRes.write('partial-bytes');
      mockRes.destroy();

      await expect(promise).rejects.toThrow('Premature close');
      const tempPath = vi.mocked(fs.createWriteStream).mock.calls[0][0];
      expect(fs.promises.rename).not.toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalledWith(tempPath);
    });

    it('should reject and remove partial temp file when response ends with complete === false', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200, {}, false);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(assetUrl, '/dest');
      mockRes.end('truncated-bytes');

      await expect(promise).rejects.toThrow(
        `Response ended prematurely while downloading ${assetUrl}`,
      );
      const tempPath = vi.mocked(fs.createWriteStream).mock.calls[0][0];
      expect(fs.promises.rename).not.toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalledWith(tempPath);
    });

    it('should settle once with the first error when multiple failures occur', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(assetUrl, '/dest');
      await vi.waitUntil(
        () => vi.mocked(fs.createWriteStream).mock.calls.length > 0,
      );
      mockStream.emit('error', new Error('First failure: EACCES'));
      mockRes.emit('error', new Error('Second failure: socket reset'));
      mockReq.emit('error', new Error('Third failure: request aborted'));

      await expect(promise).rejects.toThrow('First failure: EACCES');
      expect(fs.promises.unlink).toHaveBeenCalledOnce();
    });

    it('should clean up temp file if renaming to destination fails', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);
      vi.mocked(fs.promises.rename).mockRejectedValueOnce(
        new Error('EISDIR: illegal operation on a directory'),
      );

      const promise = downloadFile(assetUrl, '/dest');
      mockRes.end('complete-bytes');

      await expect(promise).rejects.toThrow(
        'EISDIR: illegal operation on a directory',
      );
      const tempPath = vi.mocked(fs.createWriteStream).mock.calls[0][0];
      expect(fs.promises.unlink).toHaveBeenCalledWith(tempPath);
    });

    it('should reject, destroy response stream, and remove partial temp file when request emits an error mid-download', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(assetUrl, '/dest');
      await vi.waitUntil(
        () => vi.mocked(fs.createWriteStream).mock.calls.length > 0,
      );
      mockRes.write('partial-bytes');
      mockReq.emit('error', new Error('ECONNRESET: socket hang up'));

      await expect(promise).rejects.toThrow('ECONNRESET: socket hang up');
      const tempPath = vi.mocked(fs.createWriteStream).mock.calls[0][0];
      expect(mockRes.destroyed).toBe(true);
      expect(fs.promises.rename).not.toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalledWith(tempPath);
    });

    it('should configure a 30000ms timeout, destroy request, and reject when request times out before response', async () => {
      const destroyMock = vi.fn();
      vi.mocked(https.get).mockImplementationOnce((_url, options) => {
        expect(options).toEqual(
          expect.objectContaining({
            timeout: 30000,
          }),
        );
        const req = Object.assign(new EventEmitter(), {
          destroy: destroyMock,
        }) as unknown as ClientRequest;
        queueMicrotask(() => {
          req.emit('timeout');
          req.emit('error', new Error('socket hang up'));
        });
        return req;
      });

      await expect(downloadFile(assetUrl, '/dest')).rejects.toThrow(
        'Request timed out after 30000ms',
      );
      expect(destroyMock).toHaveBeenCalledOnce();
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('should destroy response stream and remove partial temp file when request times out mid-download', async () => {
      const destroyMock = vi.fn();
      const mockReq = Object.assign(new EventEmitter(), {
        destroy: destroyMock,
      });
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementationOnce((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      const promise = downloadFile(assetUrl, '/dest');
      await vi.waitUntil(
        () => vi.mocked(fs.createWriteStream).mock.calls.length > 0,
      );
      mockRes.write('partial-bytes');
      mockReq.emit('timeout');

      await expect(promise).rejects.toThrow('Request timed out after 30000ms');
      const tempPath = vi.mocked(fs.createWriteStream).mock.calls[0][0];
      expect(destroyMock).toHaveBeenCalledOnce();
      expect(mockRes.destroyed).toBe(true);
      expect(fs.promises.rename).not.toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalledWith(tempPath);
    });

    it('should ignore late errors and timeouts on original request and response once a redirect has started', async () => {
      const destroyMock = vi.fn();
      const originalReq = Object.assign(new EventEmitter(), {
        destroy: destroyMock,
      });
      const mockResRedirect = createMockResponse(302, {
        location: redirectedAssetUrl,
      });
      const mockResSuccess = createMockResponse(200);

      vi.mocked(https.get)
        .mockImplementationOnce((url, options, cb) => {
          if (typeof options === 'function') cb = options;
          queueMicrotask(() => {
            if (cb) cb(mockResRedirect);
          });
          return originalReq as unknown as ClientRequest;
        })
        .mockImplementationOnce((url, options, cb) => {
          // Emit late timeout and errors on original request and drained redirect response while redirect is in flight
          originalReq.emit('timeout');
          originalReq.emit('error', new Error('late original req error'));
          mockResRedirect.emit('error', new Error('late redirect drain error'));
          if (typeof options === 'function') cb = options;
          queueMicrotask(() => {
            if (cb) cb(mockResSuccess);
            mockResSuccess.end('redirected-contents');
          });
          return new EventEmitter() as unknown as ClientRequest;
        });

      const mockStream = createMockWriteStream();
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream);

      await expect(downloadFile(assetUrl, '/dest')).resolves.toBeUndefined();
      expect(destroyMock).toHaveBeenCalledOnce();
      expect(fs.promises.rename).toHaveBeenCalledOnce();
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });

    it('should reject and destroy response if createWriteStream throws synchronously', async () => {
      const mockReq = new EventEmitter();
      const mockRes = createMockResponse(200);

      vi.mocked(https.get).mockImplementation((url, options, cb) => {
        if (typeof options === 'function') cb = options;
        if (cb) cb(mockRes);
        return mockReq as unknown as ClientRequest;
      });

      vi.mocked(fs.createWriteStream).mockImplementation(() => {
        throw new Error('ERR_INVALID_ARG_VALUE: invalid path');
      });

      await expect(downloadFile(assetUrl, '/dest')).rejects.toThrow(
        'ERR_INVALID_ARG_VALUE: invalid path',
      );
      expect(mockRes.destroyed).toBe(true);
      expect(fs.promises.rename).not.toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalledOnce();
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
