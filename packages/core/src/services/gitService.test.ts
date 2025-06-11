/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitService, historyDirName } from './gitService.js';
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

describe('GitService', () => {
  const mockProjectRoot = '/test/project';

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

    hoistedMockSimpleGit.mockImplementation(() => ({
      checkIsRepo: hoistedMockCheckIsRepo,
      init: hoistedMockInit,
      raw: hoistedMockRaw,
      add: hoistedMockAdd,
      commit: hoistedMockCommit,
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
    it('should throw an error if projectRoot is not a Git repository', async () => {
      hoistedIsGitRepositoryMock.mockReturnValue(false);
      const service = new GitService(mockProjectRoot);
      await expect(service.initialize()).rejects.toThrow(
        'GitService requires a Git repository',
      );
    });

    it('should throw an error if Git is not available', async () => {
      hoistedMockExec.mockImplementation((command, callback) => {
        callback(new Error('git not found'));
        return {} as ChildProcess;
      });
      const service = new GitService(mockProjectRoot);
      await expect(service.initialize()).rejects.toThrow(
        'GitService requires Git to be installed',
      );
    });
  });

  it('should call setupHiddenGitRepository if Git is available', async () => {
    const service = new GitService(mockProjectRoot);
    const setupSpy = vi
      .spyOn(service, 'setupHiddenGitRepository')
      .mockResolvedValue(undefined);

    await service.initialize();
    expect(setupSpy).toHaveBeenCalled();
  });

  describe('setupHiddenGitRepository', () => {
    const historyDir = path.join(mockProjectRoot, historyDirName);
    const repoDir = path.join(historyDir, 'repository');
    const hiddenGitIgnorePath = path.join(repoDir, '.gitignore');
    const visibleGitIgnorePath = path.join(mockProjectRoot, '.gitignore');

    it('should create history and repository directories', async () => {
      const service = new GitService(mockProjectRoot);
      await service.setupHiddenGitRepository();
      expect(hoistedMockMkdir).toHaveBeenCalledWith(repoDir, {
        recursive: true,
      });
    });

    it('should initialize git repo in historyDir if not already initialized', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(false);
      const service = new GitService(mockProjectRoot);
      await service.setupHiddenGitRepository();
      expect(hoistedMockSimpleGit).toHaveBeenCalledWith(repoDir);
      expect(hoistedMockInit).toHaveBeenCalled();
    });

    it('should not initialize git repo if already initialized', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(true);
      const service = new GitService(mockProjectRoot);
      await service.setupHiddenGitRepository();
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
      await service.setupHiddenGitRepository();
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
        (e: unknown): e is NodeJS.ErrnoException =>
          e === readError &&
          e instanceof Error &&
          (e as NodeJS.ErrnoException).code !== 'ENOENT',
      );

      const service = new GitService(mockProjectRoot);
      await expect(service.setupHiddenGitRepository()).rejects.toThrow(
        'Read permission denied',
      );
    });

    it('should add historyDirName to projectRoot .gitignore if not present', async () => {
      const initialGitignoreContent = 'node_modules/';
      hoistedMockReadFile.mockImplementation(async (filePath) => {
        if (filePath === visibleGitIgnorePath) {
          return initialGitignoreContent;
        }
        return '';
      });
      const service = new GitService(mockProjectRoot);
      await service.setupHiddenGitRepository();
      const expectedContent = `${initialGitignoreContent}\n# Gemini CLI history directory\n${historyDirName}\n`;
      expect(hoistedMockWriteFile).toHaveBeenCalledWith(
        visibleGitIgnorePath,
        expectedContent,
      );
    });

    it('should make an initial commit if no commits exist in history repo', async () => {
      hoistedMockRaw.mockResolvedValue('');
      const service = new GitService(mockProjectRoot);
      await service.setupHiddenGitRepository();
      expect(hoistedMockAdd).toHaveBeenCalledWith(hiddenGitIgnorePath);
      expect(hoistedMockCommit).toHaveBeenCalledWith('Initial commit');
    });

    it('should not make an initial commit if commits already exist', async () => {
      hoistedMockRaw.mockResolvedValue('test-commit');
      const service = new GitService(mockProjectRoot);
      await service.setupHiddenGitRepository();
      expect(hoistedMockAdd).not.toHaveBeenCalled();
      expect(hoistedMockCommit).not.toHaveBeenCalled();
    });
  });
});
