/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitService } from './gitService.js';
import * as path from 'path';
import type * as FsPromisesModule from 'fs/promises';
import type { ChildProcess } from 'node:child_process';

const hoistedMockExec = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  exec: hoistedMockExec,
}));

const hoistedMockMkdir = vi.hoisted(() => vi.fn());
const hoistedMockReadFile = vi.hoisted(() => vi.fn());
const hoistedMockWriteFile = vi.hoisted(() => vi.fn());

vi.mock('fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof FsPromisesModule;
  return {
    ...actual,
    mkdir: hoistedMockMkdir,
    readFile: hoistedMockReadFile,
    writeFile: hoistedMockWriteFile,
  };
});

const hoistedMockEnv = vi.hoisted(() => vi.fn());
const hoistedMockSimpleGit = vi.hoisted(() => vi.fn());
const hoistedMockCheckIsRepo = vi.hoisted(() => vi.fn());
const hoistedMockInit = vi.hoisted(() => vi.fn());
const hoistedMockRaw = vi.hoisted(() => vi.fn());
const hoistedMockAdd = vi.hoisted(() => vi.fn());
const hoistedMockCommit = vi.hoisted(() => vi.fn());
vi.mock('simple-git', () => ({
  simpleGit: hoistedMockSimpleGit.mockImplementation(() => ({
    checkIsRepo: hoistedMockCheckIsRepo,
    init: hoistedMockInit,
    raw: hoistedMockRaw,
    add: hoistedMockAdd,
    commit: hoistedMockCommit,
    env: hoistedMockEnv,
  })),
  CheckRepoActions: { IS_REPO_ROOT: 'is-repo-root' },
}));

const hoistedIsGitRepositoryMock = vi.hoisted(() => vi.fn());
vi.mock('../utils/gitUtils.js', () => ({
  isGitRepository: hoistedIsGitRepositoryMock,
}));

const hoistedMockIsNodeError = vi.hoisted(() => vi.fn());
vi.mock('../utils/errors.js', () => ({
  isNodeError: hoistedMockIsNodeError,
}));

const hoistedMockHomedir = vi.hoisted(() => vi.fn());
vi.mock('os', () => ({
  homedir: hoistedMockHomedir,
}));

const hoistedMockCreateHash = vi.hoisted(() => {
  const mockUpdate = vi.fn().mockReturnThis();
  const mockDigest = vi.fn();
  return {
    createHash: vi.fn(() => ({
      update: mockUpdate,
      digest: mockDigest,
    })),
    mockUpdate,
    mockDigest,
  };
});
vi.mock('crypto', () => ({
  createHash: hoistedMockCreateHash.createHash,
}));

describe('GitService', () => {
  const mockProjectRoot = '/test/project';
  const mockHomedir = '/mock/home';
  const mockHash = 'mock-hash';

  beforeEach(() => {
    vi.clearAllMocks();
    hoistedIsGitRepositoryMock.mockReturnValue(true);
    hoistedMockExec.mockImplementation((command, callback) => {
      if (command === 'git --version') {
        callback(null, 'git version 2.0.0');
      } else {
        callback(new Error('Command not mocked'));
      }
      return {};
    });
    hoistedMockMkdir.mockResolvedValue(undefined);
    hoistedMockReadFile.mockResolvedValue('');
    hoistedMockWriteFile.mockResolvedValue(undefined);
    hoistedMockIsNodeError.mockImplementation((e) => e instanceof Error);
    hoistedMockHomedir.mockReturnValue(mockHomedir);
    hoistedMockCreateHash.mockUpdate.mockReturnThis();
    hoistedMockCreateHash.mockDigest.mockReturnValue(mockHash);

    hoistedMockEnv.mockImplementation(() => ({
      checkIsRepo: hoistedMockCheckIsRepo,
      init: hoistedMockInit,
      raw: hoistedMockRaw,
      add: hoistedMockAdd,
      commit: hoistedMockCommit,
    }));
    hoistedMockSimpleGit.mockImplementation(() => ({
      checkIsRepo: hoistedMockCheckIsRepo,
      init: hoistedMockInit,
      raw: hoistedMockRaw,
      add: hoistedMockAdd,
      commit: hoistedMockCommit,
      env: hoistedMockEnv,
    }));
    hoistedMockCheckIsRepo.mockResolvedValue(false);
    hoistedMockInit.mockResolvedValue(undefined);
    hoistedMockRaw.mockResolvedValue('');
    hoistedMockAdd.mockResolvedValue(undefined);
    hoistedMockCommit.mockResolvedValue({
      commit: 'initial',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should successfully create an instance if projectRoot is a Git repository', () => {
      expect(() => new GitService(mockProjectRoot)).not.toThrow();
    });
  });

  describe('verifyGitAvailability', () => {
    it('should resolve true if git --version command succeeds', async () => {
      const service = new GitService(mockProjectRoot);
      await expect(service.verifyGitAvailability()).resolves.toBe(true);
    });

    it('should resolve false if git --version command fails', async () => {
      hoistedMockExec.mockImplementation((command, callback) => {
        callback(new Error('git not found'));
        return {} as ChildProcess;
      });
      const service = new GitService(mockProjectRoot);
      await expect(service.verifyGitAvailability()).resolves.toBe(false);
    });
  });

  describe('initialize', () => {
    it('should throw an error if Git is not available', async () => {
      hoistedMockExec.mockImplementation((command, callback) => {
        callback(new Error('git not found'));
        return {} as ChildProcess;
      });
      const service = new GitService(mockProjectRoot);
      await expect(service.initialize()).rejects.toThrow(
        'Checkpointing is enabled, but Git is not installed. Please install Git or disable checkpointing to continue.',
      );
    });

    it('should call setupShadowGitRepository if Git is available', async () => {
      const service = new GitService(mockProjectRoot);
      const setupSpy = vi
        .spyOn(service, 'setupShadowGitRepository')
        .mockResolvedValue(undefined);

      await service.initialize();
      expect(setupSpy).toHaveBeenCalled();
    });
  });

  describe('setupShadowGitRepository', () => {
    const repoDir = path.join(mockHomedir, '.gemini', 'history', mockHash);
    const hiddenGitIgnorePath = path.join(repoDir, '.gitignore');
    const visibleGitIgnorePath = path.join(mockProjectRoot, '.gitignore');
    const gitConfigPath = path.join(repoDir, '.gitconfig');

    it('should create a .gitconfig file with the correct content', async () => {
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      const expectedConfigContent =
        '[user]\n  name = Gemini CLI\n  email = gemini-cli@google.com\n[commit]\n  gpgsign = false\n';
      expect(hoistedMockWriteFile).toHaveBeenCalledWith(
        gitConfigPath,
        expectedConfigContent,
      );
    });

    it('should create history and repository directories', async () => {
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockMkdir).toHaveBeenCalledWith(repoDir, {
        recursive: true,
      });
    });

    it('should initialize git repo in historyDir if not already initialized', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(false);
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockSimpleGit).toHaveBeenCalledWith(repoDir);
      expect(hoistedMockInit).toHaveBeenCalled();
    });

    it('should not initialize git repo if already initialized', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(true);
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockInit).not.toHaveBeenCalled();
    });

    it('should copy .gitignore from projectRoot if it exists', async () => {
      const gitignoreContent = `node_modules/\n.env`;
      hoistedMockReadFile.mockImplementation(async (filePath) => {
        if (filePath === visibleGitIgnorePath) {
          return gitignoreContent;
        }
        return '';
      });
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockReadFile).toHaveBeenCalledWith(
        visibleGitIgnorePath,
        'utf-8',
      );
      expect(hoistedMockWriteFile).toHaveBeenCalledWith(
        hiddenGitIgnorePath,
        gitignoreContent,
      );
    });

    it('should throw an error if reading projectRoot .gitignore fails with other errors', async () => {
      const readError = new Error('Read permission denied');
      hoistedMockReadFile.mockImplementation(async (filePath) => {
        if (filePath === visibleGitIgnorePath) {
          throw readError;
        }
        return '';
      });
      hoistedMockIsNodeError.mockImplementation(
        (e: unknown): e is NodeJS.ErrnoException => e instanceof Error,
      );

      const service = new GitService(mockProjectRoot);
      await expect(service.setupShadowGitRepository()).rejects.toThrow(
        'Read permission denied',
      );
    });

    it('should make an initial commit if no commits exist in history repo', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(false);
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockCommit).toHaveBeenCalledWith('Initial commit', {
        '--allow-empty': null,
      });
    });

    it('should not make an initial commit if commits already exist', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(true);
      const service = new GitService(mockProjectRoot);
      await service.setupShadowGitRepository();
      expect(hoistedMockCommit).not.toHaveBeenCalled();
    });
  });
});
