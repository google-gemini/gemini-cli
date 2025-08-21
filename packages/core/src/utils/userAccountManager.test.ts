/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import { UserAccountManager } from './userAccountManager.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
  return {
    ...os,
    homedir: vi.fn(),
  };
});

describe('UserAccountManager', () => {
  let tempHomeDir: string;
  let userAccountManager: UserAccountManager;
  let accountsFile: () => string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    (os.homedir as Mock).mockReturnValue(tempHomeDir);
    accountsFile = () =>
      path.join(tempHomeDir, '.gemini', 'google_accounts.json');
    userAccountManager = new UserAccountManager();
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('cacheGoogleAccount', () => {
    it('should create directory and write initial account file', async () => {
      await userAccountManager.cacheGoogleAccount('test1@google.com');

      // Verify Google Account ID was cached
      expect(fs.existsSync(accountsFile())).toBe(true);
      expect(fs.readFileSync(accountsFile(), 'utf-8')).toBe(
        JSON.stringify({ active: 'test1@google.com', old: [] }, null, 2),
      );
    });

    it('should update active account and move previous to old', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify(
          { active: 'test2@google.com', old: ['test1@google.com'] },
          null,
          2,
        ),
      );

      await userAccountManager.cacheGoogleAccount('test3@google.com');

      expect(fs.readFileSync(accountsFile(), 'utf-8')).toBe(
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
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify(
          { active: 'test1@google.com', old: ['test2@google.com'] },
          null,
          2,
        ),
      );
      await userAccountManager.cacheGoogleAccount('test2@google.com');
      await userAccountManager.cacheGoogleAccount('test1@google.com');

      expect(fs.readFileSync(accountsFile(), 'utf-8')).toBe(
        JSON.stringify(
          { active: 'test1@google.com', old: ['test2@google.com'] },
          null,
          2,
        ),
      );
    });

    it('should handle corrupted JSON by starting fresh', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), 'not valid json');
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      await userAccountManager.cacheGoogleAccount('test1@google.com');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'))).toEqual({
        active: 'test1@google.com',
        old: [],
      });
    });

    it('should handle valid JSON with incorrect schema by starting fresh', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({ active: 'test1@google.com', old: 'not-an-array' }),
      );
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      await userAccountManager.cacheGoogleAccount('test2@google.com');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'))).toEqual({
        active: 'test2@google.com',
        old: [],
      });
    });
  });

  describe('getCachedGoogleAccount', () => {
    it('should return the active account if file exists and is valid', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({ active: 'active@google.com', old: [] }, null, 2),
      );
      const account = userAccountManager.getCachedGoogleAccount();
      expect(account).toBe('active@google.com');
    });

    it('should return null if file does not exist', () => {
      const account = userAccountManager.getCachedGoogleAccount();
      expect(account).toBeNull();
    });

    it('should return null if file is empty', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '');
      const account = userAccountManager.getCachedGoogleAccount();
      expect(account).toBeNull();
    });

    it('should return null and log if file is corrupted', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '{ "active": "test@google.com"'); // Invalid JSON
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      const account = userAccountManager.getCachedGoogleAccount();

      expect(account).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should return null if active key is missing', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), JSON.stringify({ old: [] }));
      const account = userAccountManager.getCachedGoogleAccount();
      expect(account).toBeNull();
    });
  });

  describe('clearCachedGoogleAccount', () => {
    it('should set active to null and move it to old', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify(
          { active: 'active@google.com', old: ['old1@google.com'] },
          null,
          2,
        ),
      );

      await userAccountManager.clearCachedGoogleAccount();

      const stored = JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual(['old1@google.com', 'active@google.com']);
    });

    it('should handle empty file gracefully', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '');
      await userAccountManager.clearCachedGoogleAccount();
      const stored = JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual([]);
    });

    it('should handle corrupted JSON by creating a fresh file', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), 'not valid json');
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      await userAccountManager.clearCachedGoogleAccount();

      expect(consoleLogSpy).toHaveBeenCalled();
      const stored = JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual([]);
    });

    it('should be idempotent if active account is already null', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({ active: null, old: ['old1@google.com'] }, null, 2),
      );

      await userAccountManager.clearCachedGoogleAccount();

      const stored = JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual(['old1@google.com']);
    });

    it('should not add a duplicate to the old list', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
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

      const stored = JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual(['active@google.com']);
    });
  });

  describe('getLifetimeGoogleAccounts', () => {
    it('should return 0 if the file does not exist', () => {
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(0);
    });

    it('should return 0 if the file is empty', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '');
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(0);
    });

    it('should return 0 if the file is corrupted', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), 'invalid json');
      const consoleDebugSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(0);
      expect(consoleDebugSpy).toHaveBeenCalled();
    });

    it('should return 1 if there is only an active account', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({ active: 'test1@google.com', old: [] }),
      );
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(1);
    });

    it('should correctly count old accounts when active is null', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({
          active: null,
          old: ['test1@google.com', 'test2@google.com'],
        }),
      );
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(2);
    });

    it('should correctly count both active and old accounts', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({
          active: 'test3@google.com',
          old: ['test1@google.com', 'test2@google.com'],
        }),
      );
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(3);
    });

    it('should handle valid JSON with incorrect schema by returning 0', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({ active: null, old: 1 }),
      );
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should not double count if active account is also in old list', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({
          active: 'test1@google.com',
          old: ['test1@google.com', 'test2@google.com'],
        }),
      );
      expect(userAccountManager.getLifetimeGoogleAccounts()).toBe(2);
    });
  });
});
