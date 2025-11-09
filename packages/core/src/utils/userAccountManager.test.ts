/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {} from 'vitest';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserAccountManager } from './userAccountManager.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { Storage } from '../config/storage.js';
import path from 'node:path';

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
  return {
    ...os,
    homedir: vi.fn(),
  };
});

vi.mock('../config/storage', () => ({
  Storage: {
    getGoogleAccountsPath: vi.fn(),
  },
}));

describe('UserAccountManager', () => {
  let userAccountManager: UserAccountManager;
  const MOCK_DATA_DIR = path.join(os.tmpdir(), 'gemini');
  const getMockAccountsFile = () =>
    path.join(MOCK_DATA_DIR, 'google_accounts.json');
  const mockFiles: Record<string, string> = {};

  beforeEach(() => {
    vi.mocked(Storage).getGoogleAccountsPath.mockReturnValue(
      getMockAccountsFile(),
    );
    userAccountManager = new UserAccountManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key in mockFiles) {
      delete mockFiles[key];
    }
  });

  describe('cacheGoogleAccount', () => {
    it('should create directory and write initial account file', async () => {
      const accountsFilePath = getMockAccountsFile();
      vi.mocked(Storage).getGoogleAccountsPath.mockReturnValue(
        getMockAccountsFile(),
      );
      await userAccountManager.cacheGoogleAccount('test1@google.com');

      // Verify Google Account ID was cached
      expect(fs.existsSync(accountsFilePath)).toBe(true);
      expect(fs.readFileSync(accountsFilePath, 'utf-8')).toBe(
        JSON.stringify({ active: 'test1@google.com', old: [] }, null, 2),
      );
    });

    it('should update active account and move previous to old', async () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify(
          { active: 'test2@google.com', old: ['test1@google.com'] },
          null,
          2,
        ),
      );

      await userAccountManager.cacheGoogleAccount('test3@google.com');

      expect(fs.readFileSync(accountsFilePath, 'utf-8')).toBe(
        JSON.stringify(
          {
            active: 'test3@google.com',
            old: ['test1@google.com', 'test2@google.com'],
          },
          null,
          2,
        ),
      );
    });

    it('should not add a duplicate to the old list', async () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify(
          { active: 'test1@google.com', old: ['test2@google.com'] },
          null,
          2,
        ),
      );
      await userAccountManager.cacheGoogleAccount('test2@google.com');
      await userAccountManager.cacheGoogleAccount('test1@google.com');

      expect(fs.readFileSync(accountsFilePath, 'utf-8')).toBe(
        JSON.stringify(
          { active: 'test1@google.com', old: ['test2@google.com'] },
          null,
          2,
        ),
      );
    });

    it('should handle corrupted JSON by starting fresh', async () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(accountsFilePath, 'not valid json');
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      await userAccountManager.cacheGoogleAccount('test1@google.com');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(JSON.parse(fs.readFileSync(accountsFilePath, 'utf-8'))).toEqual({
        active: 'test1@google.com',
        old: [],
      });
    });

    it('should handle valid JSON with incorrect schema by starting fresh', async () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify({ active: 'test1@google.com', old: 'not-an-array' }),
      );
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      await userAccountManager.cacheGoogleAccount('test2@google.com');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(JSON.parse(fs.readFileSync(accountsFilePath, 'utf-8'))).toEqual({
        active: 'test2@google.com',
        old: [],
      });
    });
  });

  describe('getCachedGoogleAccount', () => {
    it('should return the active account if file exists and is valid', () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify({ active: 'active@google.com', old: [] }, null, 2),
      );
      const account = userAccountManager.getCachedGoogleAccount();
      expect(account).toBe('active@google.com');
    });

    it('should return null if file does not exist', () => {
      vi.mocked(Storage).getGoogleAccountsPath.mockReturnValue(
        getMockAccountsFile(),
      );
      const account = userAccountManager.getCachedGoogleAccount();
      expect(account).toBeNull();
    });

    it('should return null if file is empty', () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(accountsFilePath, '');
      const account = userAccountManager.getCachedGoogleAccount();
      expect(account).toBeNull();
    });

    it('should return null and log if file is corrupted', () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(accountsFilePath, '{ "active": "test@google.com"'); // Invalid JSON
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      const account = userAccountManager.getCachedGoogleAccount();

      expect(account).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should return null if active key is missing', () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(accountsFilePath, JSON.stringify({ old: [] }));
      const account = userAccountManager.getCachedGoogleAccount();
      expect(account).toBeNull();
    });
  });

  describe('clearCachedGoogleAccount', () => {
    it('should set active to null and move it to old', async () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify(
          { active: 'active@google.com', old: ['old1@google.com'] },
          null,
          2,
        ),
      );

      await userAccountManager.clearCachedGoogleAccount();

      const stored = JSON.parse(fs.readFileSync(accountsFilePath, 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual(['old1@google.com', 'active@google.com']);
    });

    it('should handle empty file gracefully', async () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(accountsFilePath, '');
      await userAccountManager.clearCachedGoogleAccount();
      const stored = JSON.parse(fs.readFileSync(accountsFilePath, 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual([]);
    });

    it('should handle corrupted JSON by creating a fresh file', async () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(accountsFilePath, 'not valid json');
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      await userAccountManager.clearCachedGoogleAccount();

      expect(consoleLogSpy).toHaveBeenCalled();
      const stored = JSON.parse(fs.readFileSync(accountsFilePath, 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual([]);
    });

    it('should be idempotent if active account is already null', async () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify({ active: null, old: ['old1@google.com'] }, null, 2),
      );

      await userAccountManager.clearCachedGoogleAccount();

      const stored = JSON.parse(fs.readFileSync(accountsFilePath, 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual(['old1@google.com']);
    });

    it('should not add a duplicate to the old list', async () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify(
          {
            active: 'active@google.com',
            old: ['active@google.com'],
          },
          null,
          2,
        ),
      );

      await userAccountManager.clearCachedGoogleAccount();

      const stored = JSON.parse(
        fs.readFileSync(getMockAccountsFile(), 'utf-8'),
      );
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual(['active@google.com']);
    });
  });

  describe('getLifetimeGoogleAccounts', () => {
    it('should return 0 if the file does not exist', () => {
      vi.mocked(Storage).getGoogleAccountsPath.mockReturnValue(
        getMockAccountsFile(),
      );
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(0);
    });

    it('should return 0 if the file is empty', () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(accountsFilePath, '');
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(0);
    });

    it('should return 0 if the file is corrupted', () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(accountsFilePath, 'invalid json');
      const consoleDebugSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(0);
      expect(consoleDebugSpy).toHaveBeenCalled();
    });

    it('should return 1 if there is only an active account', () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify({ active: 'test1@google.com', old: [] }),
      );
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(1);
    });

    it('should correctly count old accounts when active is null', () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify({
          active: null,
          old: ['test1@google.com', 'test2@google.com'],
        }),
      );
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(2);
    });

    it('should correctly count both active and old accounts', () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify({
          active: 'test3@google.com',
          old: ['test1@google.com', 'test2@google.com'],
        }),
      );
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(3);
    });

    it('should handle valid JSON with incorrect schema by returning 0', () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify({ active: null, old: 1 }),
      );
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should not double count if active account is also in old list', () => {
      const accountsFilePath = getMockAccountsFile();
      fs.mkdirSync(path.dirname(accountsFilePath), { recursive: true });
      fs.writeFileSync(
        accountsFilePath,
        JSON.stringify({
          active: 'test1@google.com',
          old: ['test1@google.com', 'test2@google.com'],
        }),
      );
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(2);
    });
  });
});
