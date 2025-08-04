/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import {
  cacheGoogleAccount,
  getCachedGoogleAccount,
  clearCachedGoogleAccount,
  getLifetimeGoogleAccounts,
} from './user_account.js';
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

describe('user_account', () => {
  let tempHomeDir: string;
  const accountsFile = () =>
    path.join(tempHomeDir, '.gemini', 'google_accounts.json');
  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    (os.homedir as Mock).mockReturnValue(tempHomeDir);
  });
  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('cacheGoogleAccount', () => {
    it('should create directory and write initial account file', async () => {
      await cacheGoogleAccount('test1@google.com');

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

      await cacheGoogleAccount('test3@google.com');

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
      await cacheGoogleAccount('test2@google.com');
      await cacheGoogleAccount('test1@google.com');

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
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      await cacheGoogleAccount('test1@google.com');

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'))).toEqual({
        active: 'test1@google.com',
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
      const account = getCachedGoogleAccount();
      expect(account).toBe('active@google.com');
    });

    it('should return null if file does not exist', () => {
      const account = getCachedGoogleAccount();
      expect(account).toBeNull();
    });

    it('should return null if file is empty', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '');
      const account = getCachedGoogleAccount();
      expect(account).toBeNull();
    });

    it('should return null and log if file is corrupted', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '{ "active": "test@google.com"'); // Invalid JSON
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      const account = getCachedGoogleAccount();

      expect(account).toBeNull();
      expect(consoleDebugSpy).toHaveBeenCalled();
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

      await clearCachedGoogleAccount();

      const stored = JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual(['old1@google.com', 'active@google.com']);
    });

    it('should handle empty file gracefully', async () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '');
      await clearCachedGoogleAccount();
      const stored = JSON.parse(fs.readFileSync(accountsFile(), 'utf-8'));
      expect(stored.active).toBeNull();
      expect(stored.old).toEqual([]);
    });
  });

  describe('getLifetimeGoogleAccounts', () => {
    it('should return 0 if the file does not exist', () => {
      expect(getLifetimeGoogleAccounts()).toBe(0);
    });

    it('should return 0 if the file is empty', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), '');
      expect(getLifetimeGoogleAccounts()).toBe(0);
    });

    it('should return 0 if the file is corrupted', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(accountsFile(), 'invalid json');
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      expect(getLifetimeGoogleAccounts()).toBe(0);
      expect(consoleDebugSpy).toHaveBeenCalled();
    });

    it('should return 1 if there is only an active account', () => {
      fs.mkdirSync(path.dirname(accountsFile()), { recursive: true });
      fs.writeFileSync(
        accountsFile(),
        JSON.stringify({ active: 'test1@google.com', old: [] }),
      );
      expect(getLifetimeGoogleAccounts()).toBe(1);
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
      expect(getLifetimeGoogleAccounts()).toBe(2);
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
      expect(getLifetimeGoogleAccounts()).toBe(3);
    });
  });
});
