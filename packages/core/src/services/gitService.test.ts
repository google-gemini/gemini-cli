/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitService } from './gitService.js';
import { Storage } from '../config/storage.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import type { ChildProcess } from 'node:child_process';
import { getProjectHash, GEMINI_DIR } from '../utils/paths.js';

const hoistedMockExec = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  exec: hoistedMockExec,
}));

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

const hoistedMockHomedir = vi.hoisted(() => vi.fn());
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    homedir: hoistedMockHomedir,
  };
});

describe('GitService', () => {
  let testRootDir: string;
  let projectRoot: string;
  let homedir: string;
  let hash: string;
  let storage: Storage;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-service-test-'));
    projectRoot = path.join(testRootDir, 'project');
    homedir = path.join(testRootDir, 'home');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(homedir, { recursive: true });

    hash = getProjectHash(projectRoot);

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

    hoistedMockHomedir.mockReturnValue(homedir);

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
    storage = new Storage(projectRoot);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should successfully create an instance', () => {
      expect(() => new GitService(projectRoot, storage)).not.toThrow();
    });
  });

  describe('verifyGitAvailability', () => {
    it('should resolve true if git --version command succeeds', async () => {
      const service = new GitService(projectRoot, storage);
      await expect(service.verifyGitAvailability()).resolves.toBe(true);
    });

    it('should resolve false if git --version command fails', async () => {
      hoistedMockExec.mockImplementation((command, callback) => {
        callback(new Error('git not found'));
        return {} as ChildProcess;
      });
      const service = new GitService(projectRoot, storage);
      await expect(service.verifyGitAvailability()).resolves.toBe(false);
    });
  });

  describe('initialize', () => {
    it('should throw an error if Git is not available', async () => {
      hoistedMockExec.mockImplementation((command, callback) => {
        callback(new Error('git not found'));
        return {} as ChildProcess;
      });
      const service = new GitService(projectRoot, storage);
      await expect(service.initialize()).rejects.toThrow(
        'Checkpointing is enabled, but Git is not installed. Please install Git or disable checkpointing to continue.',
      );
    });

    it('should call setupShadowGitRepository if Git is available', async () => {
      const service = new GitService(projectRoot, storage);
      const setupSpy = vi
        .spyOn(service, 'setupShadowGitRepository')
        .mockResolvedValue(undefined);

      await service.initialize();
      expect(setupSpy).toHaveBeenCalled();
    });
  });

  describe('setupShadowGitRepository', () => {
    let repoDir: string;
    let gitConfigPath: string;

    beforeEach(() => {
      repoDir = path.join(homedir, GEMINI_DIR, 'history', hash);
      gitConfigPath = path.join(repoDir, '.gitconfig');
    });

    it('should create history and repository directories', async () => {
      const service = new GitService(projectRoot, storage);
      await service.setupShadowGitRepository();
      const stats = await fs.stat(repoDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create a .gitconfig file with the correct content', async () => {
      const service = new GitService(projectRoot, storage);
      await service.setupShadowGitRepository();

      const expectedConfigContent =
        '[user]\n  name = Gemini CLI\n  email = gemini-cli@google.com\n[commit]\n  gpgsign = false\n';
      const actualConfigContent = await fs.readFile(gitConfigPath, 'utf-8');
      expect(actualConfigContent).toBe(expectedConfigContent);
    });

    it('should initialize git repo in historyDir if not already initialized', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(false);
      const service = new GitService(projectRoot, storage);
      await service.setupShadowGitRepository();
      expect(hoistedMockSimpleGit).toHaveBeenCalledWith(repoDir);
      expect(hoistedMockInit).toHaveBeenCalled();
    });

    it('should not initialize git repo if already initialized', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(true);
      const service = new GitService(projectRoot, storage);
      await service.setupShadowGitRepository();
      expect(hoistedMockInit).not.toHaveBeenCalled();
    });

    it('should copy .gitignore from projectRoot if it exists', async () => {
      const gitignoreContent = 'node_modules/\n.env';
      const visibleGitIgnorePath = path.join(projectRoot, '.gitignore');
      await fs.writeFile(visibleGitIgnorePath, gitignoreContent);

      const service = new GitService(projectRoot, storage);
      await service.setupShadowGitRepository();

      const hiddenGitIgnorePath = path.join(repoDir, '.gitignore');
      const copiedContent = await fs.readFile(hiddenGitIgnorePath, 'utf-8');
      expect(copiedContent).toBe(gitignoreContent);
    });

    it('should not create a .gitignore in shadow repo if project .gitignore does not exist', async () => {
      const service = new GitService(projectRoot, storage);
      await service.setupShadowGitRepository();

      const hiddenGitIgnorePath = path.join(repoDir, '.gitignore');
      // An empty string is written if the file doesn't exist.
      const content = await fs.readFile(hiddenGitIgnorePath, 'utf-8');
      expect(content).toBe('');
    });

    it('should throw an error if reading projectRoot .gitignore fails with other errors', async () => {
      const visibleGitIgnorePath = path.join(projectRoot, '.gitignore');
      // Create a directory instead of a file to cause a read error
      await fs.mkdir(visibleGitIgnorePath);

      const service = new GitService(projectRoot, storage);
      // EISDIR is the expected error code on Unix-like systems
      await expect(service.setupShadowGitRepository()).rejects.toThrow(
        /EISDIR: illegal operation on a directory, read|EBUSY: resource busy or locked, read/,
      );
    });

    it('should make an initial commit if no commits exist in history repo', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(false);
      const service = new GitService(projectRoot, storage);
      await service.setupShadowGitRepository();
      expect(hoistedMockCommit).toHaveBeenCalledWith('Initial commit', {
        '--allow-empty': null,
      });
    });

    it('should not make an initial commit if commits already exist', async () => {
      hoistedMockCheckIsRepo.mockResolvedValue(true);
      const service = new GitService(projectRoot, storage);
      await service.setupShadowGitRepository();
      expect(hoistedMockCommit).not.toHaveBeenCalled();
    });
  });
});
