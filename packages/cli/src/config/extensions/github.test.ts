/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';
import {
  checkForExtensionUpdate,
  cloneFromGit,
  extractFile,
  findReleaseAsset,
  fetchReleaseFromGithub,
  tryParseGithubUrl,
} from './github.js';
import { simpleGit, type SimpleGit } from 'simple-git';
import { ExtensionUpdateState } from '../../ui/state/extensions.js';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as tar from 'tar';
import * as archiver from 'archiver';
import type { GeminiCLIExtension } from '@google/gemini-cli-core';
import { ExtensionManager } from '../extension-manager.js';
import { loadSettings } from '../settings.js';
import type { ExtensionSetting } from './extensionSettings.js';

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

const fetchJsonMock = vi.hoisted(() => vi.fn());
vi.mock('./github_fetch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./github_fetch.js')>();
  return {
    ...actual,
    fetchJson: fetchJsonMock,
  };
});

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

    let extensionManager: ExtensionManager;
    let mockRequestConsent: MockedFunction<
      (consent: string) => Promise<boolean>
    >;
    let mockPromptForSettings: MockedFunction<
      (setting: ExtensionSetting) => Promise<string>
    >;
    let tempHomeDir: string;
    let tempWorkspaceDir: string;

    beforeEach(() => {
      tempHomeDir = fsSync.mkdtempSync(
        path.join(os.tmpdir(), 'gemini-cli-test-home-'),
      );
      tempWorkspaceDir = fsSync.mkdtempSync(
        path.join(tempHomeDir, 'gemini-cli-test-workspace-'),
      );
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as SimpleGit);
      mockRequestConsent = vi.fn();
      mockRequestConsent.mockResolvedValue(true);
      mockPromptForSettings = vi.fn();
      mockPromptForSettings.mockResolvedValue('');
      extensionManager = new ExtensionManager({
        workspaceDir: tempWorkspaceDir,
        requestConsent: mockRequestConsent,
        requestSetting: mockPromptForSettings,
        settings: loadSettings(tempWorkspaceDir).merged,
      });
    });

    it.each([
      {
        testName: 'should return NOT_UPDATABLE for non-git extensions',
        extension: {
          installMetadata: { type: 'link', source: '' },
        },
        mockSetup: () => {},
        expected: ExtensionUpdateState.NOT_UPDATABLE,
      },
      {
        testName: 'should return ERROR if no remotes found',
        extension: {
          installMetadata: { type: 'git', source: '' },
        },
        mockSetup: () => {
          mockGit.getRemotes.mockResolvedValue([]);
        },
        expected: ExtensionUpdateState.ERROR,
      },
      {
        testName:
          'should return UPDATE_AVAILABLE when remote hash is different',
        extension: {
          installMetadata: { type: 'git', source: 'my/ext' },
        },
        mockSetup: () => {
          mockGit.getRemotes.mockResolvedValue([
            { name: 'origin', refs: { fetch: 'http://my-repo.com' } },
          ]);
          mockGit.listRemote.mockResolvedValue('remote-hash\tHEAD');
          mockGit.revparse.mockResolvedValue('local-hash');
        },
        expected: ExtensionUpdateState.UPDATE_AVAILABLE,
      },
      {
        testName:
          'should return UP_TO_DATE when remote and local hashes are the same',
        extension: {
          installMetadata: { type: 'git', source: 'my/ext' },
        },
        mockSetup: () => {
          mockGit.getRemotes.mockResolvedValue([
            { name: 'origin', refs: { fetch: 'http://my-repo.com' } },
          ]);
          mockGit.listRemote.mockResolvedValue('same-hash\tHEAD');
          mockGit.revparse.mockResolvedValue('same-hash');
        },
        expected: ExtensionUpdateState.UP_TO_DATE,
      },
      {
        testName: 'should return ERROR on git error',
        extension: {
          installMetadata: { type: 'git', source: 'my/ext' },
        },
        mockSetup: () => {
          mockGit.getRemotes.mockRejectedValue(new Error('git error'));
        },
        expected: ExtensionUpdateState.ERROR,
      },
    ])('$testName', async ({ extension, mockSetup, expected }) => {
      const fullExtension: GeminiCLIExtension = {
        name: 'test',
        id: 'test-id',
        path: '/ext',
        version: '1.0.0',
        isActive: true,
        contextFiles: [],
        ...extension,
      } as unknown as GeminiCLIExtension;
      mockSetup();
      const result = await checkForExtensionUpdate(
        fullExtension,
        extensionManager,
      );
      expect(result).toBe(expected);
    });
  });

  describe('fetchReleaseFromGithub', () => {
    it.each([
      {
        ref: undefined,
        allowPreRelease: true,
        mockedResponse: [{ tag_name: 'v1.0.0-alpha' }, { tag_name: 'v0.9.0' }],
        expectedUrl:
          'https://api.github.com/repos/owner/repo/releases?per_page=1',
        expectedResult: { tag_name: 'v1.0.0-alpha' },
      },
      {
        ref: undefined,
        allowPreRelease: false,
        mockedResponse: { tag_name: 'v0.9.0' },
        expectedUrl: 'https://api.github.com/repos/owner/repo/releases/latest',
        expectedResult: { tag_name: 'v0.9.0' },
      },
      {
        ref: 'v0.9.0',
        allowPreRelease: undefined,
        mockedResponse: { tag_name: 'v0.9.0' },
        expectedUrl:
          'https://api.github.com/repos/owner/repo/releases/tags/v0.9.0',
        expectedResult: { tag_name: 'v0.9.0' },
      },
      {
        ref: undefined,
        allowPreRelease: undefined,
        mockedResponse: { tag_name: 'v0.9.0' },
        expectedUrl: 'https://api.github.com/repos/owner/repo/releases/latest',
        expectedResult: { tag_name: 'v0.9.0' },
      },
    ])(
      'should fetch release with ref=$ref and allowPreRelease=$allowPreRelease',
      async ({
        ref,
        allowPreRelease,
        mockedResponse,
        expectedUrl,
        expectedResult,
      }) => {
        fetchJsonMock.mockResolvedValueOnce(mockedResponse);

        const result = await fetchReleaseFromGithub(
          'owner',
          'repo',
          ref,
          allowPreRelease,
        );

        expect(fetchJsonMock).toHaveBeenCalledWith(expectedUrl);
        expect(result).toEqual(expectedResult);
      },
    );
  });

  describe('findReleaseAsset', () => {
    const assets = [
      { name: 'darwin.arm64.extension.tar.gz', url: 'url1' },
      { name: 'darwin.x64.extension.tar.gz', url: 'url2' },
      { name: 'linux.x64.extension.tar.gz', url: 'url3' },
      { name: 'win32.x64.extension.tar.gz', url: 'url4' },
      { name: 'extension-generic.tar.gz', url: 'url5' },
    ];

    it.each([
      { platform: 'darwin', arch: 'arm64', expected: assets[0] },
      { platform: 'linux', arch: 'arm64', expected: assets[2] },

      { platform: 'sunos', arch: 'x64', expected: undefined },
    ])(
      'should find asset matching platform and architecture',

      ({ platform, arch, expected }) => {
        mockPlatform.mockReturnValue(platform);
        mockArch.mockReturnValue(arch);
        const result = findReleaseAsset(assets);
        expect(result).toEqual(expected);
      },
    );

    it('should find generic asset if it is the only one', () => {
      const singleAsset = [{ name: 'extension.tar.gz', url: 'aurl5' }];

      mockPlatform.mockReturnValue('darwin');
      mockArch.mockReturnValue('arm64');
      const result = findReleaseAsset(singleAsset);
      expect(result).toEqual(singleAsset[0]);
    });

    it('should return undefined if multiple generic assets exist', () => {
      const multipleGenericAssets = [
        { name: 'extension-1.tar.gz', url: 'aurl1' },
        { name: 'extension-2.tar.gz', url: 'aurl2' },
      ];

      mockPlatform.mockReturnValue('darwin');
      mockArch.mockReturnValue('arm64');
      const result = findReleaseAsset(multipleGenericAssets);
      expect(result).toBeUndefined();
    });
  });

  describe('parseGitHubRepoForReleases', () => {
    it.each([
      {
        source: 'https://github.com/owner/repo.git',
        owner: 'owner',
        repo: 'repo',
      },
      {
        source: 'https://github.com/owner/repo',
        owner: 'owner',
        repo: 'repo',
      },
      {
        source: 'https://github.com/owner/repo/',
        owner: 'owner',
        repo: 'repo',
      },
      {
        source: 'git@github.com:owner/repo.git',
        owner: 'owner',
        repo: 'repo',
      },
      { source: 'owner/repo', owner: 'owner', repo: 'repo' },
      { source: 'owner/repo.git', owner: 'owner', repo: 'repo' },
    ])(
      'should parse owner and repo from $source',
      ({ source, owner, repo }) => {
        const result = tryParseGithubUrl(source)!;
        expect(result.owner).toBe(owner);
        expect(result.repo).toBe(repo);
      },
    );

    it('should return null on a non-GitHub URL', () => {
      const source = 'https://example.com/owner/repo.git';
      expect(tryParseGithubUrl(source)).toBe(null);
    });

    it.each([
      { source: 'invalid-format' },
      { source: 'https://github.com/owner/repo/extra' },
    ])(
      'should throw error for invalid source format: $source',
      ({ source }) => {
        expect(() => tryParseGithubUrl(source)).toThrow(
          `Invalid GitHub repository source: ${source}. Expected "owner/repo" or a github repo uri.`,
        );
      },
    );
  });

  describe('extractFile', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-test-'));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should extract a .tar.gz file', async () => {
      const archivePath = path.join(tempDir, 'test.tar.gz');
      const extractionDest = path.join(tempDir, 'extracted');
      await fs.mkdir(extractionDest);

      // Create a dummy file to be archived
      const dummyFilePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(dummyFilePath, 'hello tar');

      // Create the tar.gz file
      await tar.c(
        {
          gzip: true,
          file: archivePath,
          cwd: tempDir,
        },
        ['test.txt'],
      );

      await extractFile(archivePath, extractionDest);

      const extractedFilePath = path.join(extractionDest, 'test.txt');
      const content = await fs.readFile(extractedFilePath, 'utf-8');
      expect(content).toBe('hello tar');
    });

    it('should extract a .zip file', async () => {
      const archivePath = path.join(tempDir, 'test.zip');
      const extractionDest = path.join(tempDir, 'extracted');
      await fs.mkdir(extractionDest);

      // Create a dummy file to be archived
      const dummyFilePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(dummyFilePath, 'hello zip');

      // Create the zip file
      const output = fsSync.createWriteStream(archivePath);
      const archive = archiver.create('zip');

      const streamFinished = new Promise((resolve, reject) => {
        output.on('close', () => resolve(null));
        archive.on('error', reject);
      });

      archive.pipe(output);
      archive.file(dummyFilePath, { name: 'test.txt' });
      await archive.finalize();
      await streamFinished;

      await extractFile(archivePath, extractionDest);

      const extractedFilePath = path.join(extractionDest, 'test.txt');
      const content = await fs.readFile(extractedFilePath, 'utf-8');
      expect(content).toBe('hello zip');
    });

    it('should throw an error for unsupported file types', async () => {
      const unsupportedFilePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(unsupportedFilePath, 'some content');
      const extractionDest = path.join(tempDir, 'extracted');
      await fs.mkdir(extractionDest);

      await expect(
        extractFile(unsupportedFilePath, extractionDest),
      ).rejects.toThrow('Unsupported file extension for extraction:');
    });
  });
});
