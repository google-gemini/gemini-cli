/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getInternalDir,
  ensureInternalDirExists,
  migrateInternalFiles,
  getInstallationIdPath,
  getGoogleAccountsPath,
  getOAuthCredsPath,
} from './migration.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    rmdirSync: vi.fn(),
    rmSync: vi.fn(),
  };
});
vi.mock('os');

describe('migration utils', () => {
  const mockHomeDir = '/mock/home';
  const mockGeminiDir = path.join(mockHomeDir, '.gemini');
  const mockInternalDir = path.join(mockGeminiDir, 'tmp');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInternalDir', () => {
    it('should return the correct tmp directory path', () => {
      const result = getInternalDir();
      expect(result).toBe(mockInternalDir);
    });
  });

  describe('ensureInternalDirExists', () => {
    it('should create tmp directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const mkdirSyncMock = vi.mocked(fs.mkdirSync);

      ensureInternalDirExists();

      expect(mkdirSyncMock).toHaveBeenCalledWith(mockInternalDir, {
        recursive: true,
      });
    });

    it('should not create directory if it already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const mkdirSyncMock = vi.mocked(fs.mkdirSync);

      ensureInternalDirExists();

      expect(mkdirSyncMock).not.toHaveBeenCalled();
    });
  });

  describe('migrateInternalFiles', () => {
    it('should migrate installation_id, google_accounts.json, and oauth_creds.json to tmp directory', () => {
      const oldInstallationPath = path.join(mockGeminiDir, 'installation_id');
      const newInstallationPath = path.join(mockInternalDir, 'installation_id');
      const oldAccountsPath = path.join(mockGeminiDir, 'google_accounts.json');
      const newAccountsPath = path.join(
        mockInternalDir,
        'google_accounts.json',
      );
      const oldOAuthPath = path.join(mockGeminiDir, 'oauth_creds.json');
      const newOAuthPath = path.join(mockInternalDir, 'oauth_creds.json');

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (
          path === oldInstallationPath ||
          path === oldAccountsPath ||
          path === oldOAuthPath
        )
          return true;
        if (
          path === newInstallationPath ||
          path === newAccountsPath ||
          path === newOAuthPath ||
          path === mockInternalDir
        )
          return false;
        return false;
      });

      const renameSyncMock = vi.mocked(fs.renameSync);
      const mkdirSyncMock = vi.mocked(fs.mkdirSync);

      migrateInternalFiles();

      expect(mkdirSyncMock).toHaveBeenCalledWith(mockInternalDir, {
        recursive: true,
      });
      expect(renameSyncMock).toHaveBeenCalledWith(
        oldInstallationPath,
        newInstallationPath,
      );
      expect(renameSyncMock).toHaveBeenCalledWith(
        oldAccountsPath,
        newAccountsPath,
      );
      expect(renameSyncMock).toHaveBeenCalledWith(oldOAuthPath, newOAuthPath);
    });

    it('should not migrate files if they do not exist in old location', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const renameSyncMock = vi.mocked(fs.renameSync);

      migrateInternalFiles();

      expect(renameSyncMock).not.toHaveBeenCalled();
    });

    it('should remove old files if they already exist in new location', () => {
      const oldInstallationPath = path.join(mockGeminiDir, 'installation_id');
      const newInstallationPath = path.join(mockInternalDir, 'installation_id');
      const oldAccountsPath = path.join(mockGeminiDir, 'google_accounts.json');
      const newAccountsPath = path.join(
        mockInternalDir,
        'google_accounts.json',
      );
      const oldOAuthPath = path.join(mockGeminiDir, 'oauth_creds.json');
      const newOAuthPath = path.join(mockInternalDir, 'oauth_creds.json');

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        // All files exist in both locations
        if (
          path === oldInstallationPath ||
          path === oldAccountsPath ||
          path === oldOAuthPath ||
          path === newInstallationPath ||
          path === newAccountsPath ||
          path === newOAuthPath ||
          path === mockInternalDir
        )
          return true;
        return false;
      });
      const renameSyncMock = vi.mocked(fs.renameSync);
      const rmSyncMock = vi.mocked(fs.rmSync);

      migrateInternalFiles();

      expect(renameSyncMock).not.toHaveBeenCalled();
      expect(rmSyncMock).toHaveBeenCalledWith(oldInstallationPath);
      expect(rmSyncMock).toHaveBeenCalledWith(oldAccountsPath);
      expect(rmSyncMock).toHaveBeenCalledWith(oldOAuthPath);
    });
  });

  describe('getInstallationIdPath', () => {
    it('should return new path if file exists in new location', () => {
      const newPath = path.join(mockInternalDir, 'installation_id');
      vi.mocked(fs.existsSync).mockImplementation((path) => path === newPath);

      const result = getInstallationIdPath();

      expect(result).toBe(newPath);
    });

    it('should migrate and return new path if file exists only in old location', () => {
      const oldPath = path.join(mockGeminiDir, 'installation_id');
      const newPath = path.join(mockInternalDir, 'installation_id');

      vi.mocked(fs.existsSync).mockImplementation((path) => path === oldPath);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      const result = getInstallationIdPath();

      expect(result).toBe(newPath);
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('should return new path if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const newPath = path.join(mockInternalDir, 'installation_id');

      const result = getInstallationIdPath();

      expect(result).toBe(newPath);
    });
  });

  describe('getGoogleAccountsPath', () => {
    it('should return new path if file exists in new location', () => {
      const newPath = path.join(mockInternalDir, 'google_accounts.json');
      vi.mocked(fs.existsSync).mockImplementation((path) => path === newPath);

      const result = getGoogleAccountsPath();

      expect(result).toBe(newPath);
    });

    it('should migrate and return new path if file exists only in old location', () => {
      const oldPath = path.join(mockGeminiDir, 'google_accounts.json');
      const newPath = path.join(mockInternalDir, 'google_accounts.json');

      vi.mocked(fs.existsSync).mockImplementation((path) => path === oldPath);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      const result = getGoogleAccountsPath();

      expect(result).toBe(newPath);
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('should return new path if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const newPath = path.join(mockInternalDir, 'google_accounts.json');

      const result = getGoogleAccountsPath();

      expect(result).toBe(newPath);
    });
  });

  describe('getOAuthCredsPath', () => {
    it('should return new path if file exists in new location', () => {
      const newPath = path.join(mockInternalDir, 'oauth_creds.json');
      vi.mocked(fs.existsSync).mockImplementation((path) => path === newPath);

      const result = getOAuthCredsPath();

      expect(result).toBe(newPath);
    });

    it('should migrate and return new path if file exists only in old location', () => {
      const oldPath = path.join(mockGeminiDir, 'oauth_creds.json');
      const newPath = path.join(mockInternalDir, 'oauth_creds.json');

      vi.mocked(fs.existsSync).mockImplementation((path) => path === oldPath);
      vi.mocked(fs.renameSync).mockImplementation(() => {});

      const result = getOAuthCredsPath();

      expect(result).toBe(newPath);
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('should return new path if file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const newPath = path.join(mockInternalDir, 'oauth_creds.json');

      const result = getOAuthCredsPath();

      expect(result).toBe(newPath);
    });
  });

  describe('data directory migration', () => {
    it('should migrate all files from data directory to tmp directory and clean up empty data dir', () => {
      const dataDir = path.join(mockGeminiDir, 'data');
      const dataAccountsPath = path.join(dataDir, 'google_accounts.json');
      const internalAccountsPath = path.join(
        mockInternalDir,
        'google_accounts.json',
      );

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === dataDir || path === dataAccountsPath) return true;
        if (path === internalAccountsPath) return false;
        return false;
      });
      let readdirCallCount = 0;
      (
        vi.mocked(fs.readdirSync) as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        readdirCallCount++;
        return readdirCallCount === 1 ? ['google_accounts.json'] : [];
      });
      const rmdirSyncMock = vi.mocked(fs.rmdirSync);
      const renameSyncMock = vi.mocked(fs.renameSync);

      migrateInternalFiles();

      expect(renameSyncMock).toHaveBeenCalledWith(
        dataAccountsPath,
        internalAccountsPath,
      );
      expect(rmdirSyncMock).toHaveBeenCalledWith(dataDir);
    });

    it('should migrate multiple files from data directory', () => {
      const dataDir = path.join(mockGeminiDir, 'data');
      const file1 = 'file1.json';
      const file2 = 'file2.txt';
      const dataFile1Path = path.join(dataDir, file1);
      const dataFile2Path = path.join(dataDir, file2);
      const internalFile1Path = path.join(mockInternalDir, file1);
      const internalFile2Path = path.join(mockInternalDir, file2);

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === dataDir) return true;
        if (path === dataFile1Path) return true;
        if (path === dataFile2Path) return true;
        if (path === internalFile1Path) return false;
        if (path === internalFile2Path) return false;
        return false;
      });
      let readdirCallCount = 0;
      (
        vi.mocked(fs.readdirSync) as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        readdirCallCount++;
        return readdirCallCount === 1 ? [file1, file2] : [];
      });
      const rmdirSyncMock = vi.mocked(fs.rmdirSync);
      const renameSyncMock = vi.mocked(fs.renameSync);

      migrateInternalFiles();

      expect(renameSyncMock).toHaveBeenCalledWith(
        dataFile1Path,
        internalFile1Path,
      );
      expect(renameSyncMock).toHaveBeenCalledWith(
        dataFile2Path,
        internalFile2Path,
      );
      expect(rmdirSyncMock).toHaveBeenCalledWith(dataDir);
    });

    it('should remove data directory after removing duplicate files', () => {
      const dataDir = path.join(mockGeminiDir, 'data');
      const file1 = 'file1.json';
      const dataFile1Path = path.join(dataDir, file1);
      const internalFile1Path = path.join(mockInternalDir, file1);

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === dataDir) return true;
        if (path === dataFile1Path) return true;
        if (path === internalFile1Path) return true; // Already exists, will remove old file
        return false;
      });
      let readdirCallCount = 0;
      (
        vi.mocked(fs.readdirSync) as ReturnType<typeof vi.fn>
      ).mockImplementation(() => {
        readdirCallCount++;
        return readdirCallCount === 1 ? [file1] : [];
      });
      const rmdirSyncMock = vi.mocked(fs.rmdirSync);
      const rmSyncMock = vi.mocked(fs.rmSync);
      const renameSyncMock = vi.mocked(fs.renameSync);

      migrateInternalFiles();

      expect(renameSyncMock).not.toHaveBeenCalled();
      expect(rmSyncMock).toHaveBeenCalledWith(dataFile1Path);
      expect(rmdirSyncMock).toHaveBeenCalledWith(dataDir);
    });
  });

  describe('getInstallationIdPath', () => {
    it('should return new path if file exists in new location', () => {
      const newPath = path.join(mockInternalDir, 'installation_id');
      vi.mocked(fs.existsSync).mockImplementation((path) => path === newPath);

      const result = getInstallationIdPath();

      expect(result).toBe(newPath);
    });

    it('should migrate and return new path if file exists only in old location', () => {
      const oldPath = path.join(mockGeminiDir, 'installation_id');
      const newPath = path.join(mockInternalDir, 'installation_id');
      vi.mocked(fs.existsSync).mockImplementation((path) => {
        if (path === oldPath) return true;
        if (path === newPath) return false;
        return false;
      });
      const renameSyncMock = vi.mocked(fs.renameSync);

      const result = getInstallationIdPath();

      expect(result).toBe(newPath);
      expect(renameSyncMock).toHaveBeenCalledWith(oldPath, newPath);
    });

    it('should return new path if file does not exist', () => {
      const newPath = path.join(mockInternalDir, 'installation_id');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getInstallationIdPath();

      expect(result).toBe(newPath);
    });
  });
});
