/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  FatalConfigError,
  ideContextStore,
  coreEvents,
} from '@google/gemini-cli-core';
import {
  loadTrustedFolders,
  TrustLevel,
  isWorkspaceTrusted,
  resetTrustedFoldersForTesting,
} from './trustedFolders.js';
import { loadEnvironment } from './settings.js';
import { createMockSettings } from '../test-utils/settings.js';
import type { Settings } from './settings.js';

// We explicitly do NOT mock 'fs' or 'proper-lockfile' here to ensure
// we are testing the actual behavior on the real file system.

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: () => '/mock/home/user',
    coreEvents: {
      emitFeedback: vi.fn(),
    },
  };
});

describe('Trusted Folders', () => {
  let tempDir: string;
  let trustedFoldersPath: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-test-'));
    trustedFoldersPath = path.join(tempDir, 'trustedFolders.json');

    // Set the environment variable to point to the temp file
    vi.stubEnv('GEMINI_CLI_TRUSTED_FOLDERS_PATH', trustedFoldersPath);

    // Reset the internal state
    resetTrustedFoldersForTesting();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up the temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  describe('Locking & Concurrency', () => {
    it('setValue should handle concurrent calls correctly using real lockfile', async () => {
      // Initialize the file
      fs.writeFileSync(trustedFoldersPath, '{}', 'utf-8');

      const loadedFolders = loadTrustedFolders();

      // Start two concurrent calls
      // These will race to acquire the lock on the real file system
      const p1 = loadedFolders.setValue('/path1', TrustLevel.TRUST_FOLDER);
      const p2 = loadedFolders.setValue('/path2', TrustLevel.TRUST_FOLDER);

      await Promise.all([p1, p2]);

      // Verify final state in the file
      const content = fs.readFileSync(trustedFoldersPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config).toEqual({
        '/path1': TrustLevel.TRUST_FOLDER,
        '/path2': TrustLevel.TRUST_FOLDER,
      });
    });
  });

  describe('Loading & Parsing', () => {
    it('should load empty rules if no files exist', () => {
      const { rules, errors } = loadTrustedFolders();
      expect(rules).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('should load rules from the configuration file', () => {
      const config = {
        '/user/folder': TrustLevel.TRUST_FOLDER,
      };
      fs.writeFileSync(trustedFoldersPath, JSON.stringify(config), 'utf-8');

      const { rules, errors } = loadTrustedFolders();
      expect(rules).toEqual([
        { path: '/user/folder', trustLevel: TrustLevel.TRUST_FOLDER },
      ]);
      expect(errors).toEqual([]);
    });

    it('should handle JSON parsing errors gracefully', () => {
      fs.writeFileSync(trustedFoldersPath, 'invalid json', 'utf-8');

      const { rules, errors } = loadTrustedFolders();
      expect(rules).toEqual([]);
      expect(errors.length).toBe(1);
      expect(errors[0].path).toBe(trustedFoldersPath);
      expect(errors[0].message).toContain('Unexpected token');
    });

    it('should handle non-object JSON gracefully', () => {
      fs.writeFileSync(trustedFoldersPath, 'null', 'utf-8');

      const { rules, errors } = loadTrustedFolders();
      expect(rules).toEqual([]);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain('not a valid JSON object');
    });

    it('should handle invalid trust levels gracefully', () => {
      const config = {
        '/path': 'INVALID_LEVEL',
      };
      fs.writeFileSync(trustedFoldersPath, JSON.stringify(config), 'utf-8');

      const { rules, errors } = loadTrustedFolders();
      expect(rules).toEqual([]);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain(
        'Invalid trust level "INVALID_LEVEL"',
      );
    });

    it('should support JSON with comments', () => {
      const content = `
        {
          // This is a comment
          "/path": "TRUST_FOLDER"
        }
      `;
      fs.writeFileSync(trustedFoldersPath, content, 'utf-8');

      const { rules, errors } = loadTrustedFolders();
      expect(rules).toEqual([
        { path: '/path', trustLevel: TrustLevel.TRUST_FOLDER },
      ]);
      expect(errors).toEqual([]);
    });
  });

  describe('isPathTrusted', () => {
    function setup(config: Record<string, TrustLevel>) {
      fs.writeFileSync(trustedFoldersPath, JSON.stringify(config), 'utf-8');
      return loadTrustedFolders();
    }

    it('provides a method to determine if a path is trusted', () => {
      const folders = setup({
        './myfolder': TrustLevel.TRUST_FOLDER,
        '/trustedparent/trustme': TrustLevel.TRUST_PARENT,
        '/user/folder': TrustLevel.TRUST_FOLDER,
        '/secret': TrustLevel.DO_NOT_TRUST,
        '/secret/publickeys': TrustLevel.TRUST_FOLDER,
      });

      // We need to resolve relative paths for comparison since the implementation uses realpath
      const resolvedMyFolder = path.resolve('./myfolder');

      expect(folders.isPathTrusted('/secret')).toBe(false);
      expect(folders.isPathTrusted('/user/folder')).toBe(true);
      expect(folders.isPathTrusted('/secret/publickeys/public.pem')).toBe(true);
      expect(folders.isPathTrusted('/user/folder/harhar')).toBe(true);
      expect(
        folders.isPathTrusted(path.join(resolvedMyFolder, 'somefile.jpg')),
      ).toBe(true);
      expect(folders.isPathTrusted('/trustedparent/someotherfolder')).toBe(
        true,
      );
      expect(folders.isPathTrusted('/trustedparent/trustme')).toBe(true);

      // No explicit rule covers this file
      expect(folders.isPathTrusted('/secret/bankaccounts.json')).toBe(false);
      expect(folders.isPathTrusted('/secret/mine/privatekey.pem')).toBe(false);
      expect(folders.isPathTrusted('/user/someotherfolder')).toBe(undefined);
    });

    it('prioritizes the longest matching path (precedence)', () => {
      const folders = setup({
        '/a': TrustLevel.TRUST_FOLDER,
        '/a/b': TrustLevel.DO_NOT_TRUST,
        '/a/b/c': TrustLevel.TRUST_FOLDER,
        '/parent/trustme': TrustLevel.TRUST_PARENT,
        '/parent/trustme/butnotthis': TrustLevel.DO_NOT_TRUST,
      });

      expect(folders.isPathTrusted('/a/b/c/d')).toBe(true);
      expect(folders.isPathTrusted('/a/b/x')).toBe(false);
      expect(folders.isPathTrusted('/a/x')).toBe(true);
      expect(folders.isPathTrusted('/parent/trustme/butnotthis/file')).toBe(
        false,
      );
      expect(folders.isPathTrusted('/parent/other')).toBe(true);
    });
  });

  describe('setValue', () => {
    it('should update the user config and save it atomically', async () => {
      fs.writeFileSync(trustedFoldersPath, '{}', 'utf-8');
      const loadedFolders = loadTrustedFolders();

      await loadedFolders.setValue('/new/path', TrustLevel.TRUST_FOLDER);

      expect(loadedFolders.user.config['/new/path']).toBe(
        TrustLevel.TRUST_FOLDER,
      );

      const content = fs.readFileSync(trustedFoldersPath, 'utf-8');
      const config = JSON.parse(content);
      expect(config['/new/path']).toBe(TrustLevel.TRUST_FOLDER);
    });

    it('should throw FatalConfigError if there were load errors', async () => {
      fs.writeFileSync(trustedFoldersPath, 'invalid json', 'utf-8');

      const loadedFolders = loadTrustedFolders();
      expect(loadedFolders.errors.length).toBe(1);

      await expect(
        loadedFolders.setValue('/some/path', TrustLevel.TRUST_FOLDER),
      ).rejects.toThrow(FatalConfigError);
    });

    it('should report corrupted config via coreEvents.emitFeedback and still succeed', async () => {
      // Initialize with valid JSON
      fs.writeFileSync(trustedFoldersPath, '{}', 'utf-8');
      const loadedFolders = loadTrustedFolders();

      // Corrupt the file after initial load
      fs.writeFileSync(trustedFoldersPath, 'invalid json', 'utf-8');

      await loadedFolders.setValue('/new/path', TrustLevel.TRUST_FOLDER);

      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('may be corrupted'),
        expect.any(Error),
      );

      // Should have overwritten the corrupted file with new valid config
      const content = fs.readFileSync(trustedFoldersPath, 'utf-8');
      const config = JSON.parse(content);
      expect(config).toEqual({ '/new/path': TrustLevel.TRUST_FOLDER });
    });
  });

  describe('isWorkspaceTrusted Integration', () => {
    const mockSettings: Settings = {
      security: {
        folderTrust: {
          enabled: true,
        },
      },
    };

    it('should return true for a directly trusted folder', () => {
      const config = { '/projectA': TrustLevel.TRUST_FOLDER };
      fs.writeFileSync(trustedFoldersPath, JSON.stringify(config), 'utf-8');

      expect(isWorkspaceTrusted(mockSettings, '/projectA')).toEqual({
        isTrusted: true,
        source: 'file',
      });
    });

    it('should return false for a directly untrusted folder', () => {
      const config = { '/untrusted': TrustLevel.DO_NOT_TRUST };
      fs.writeFileSync(trustedFoldersPath, JSON.stringify(config), 'utf-8');

      expect(isWorkspaceTrusted(mockSettings, '/untrusted')).toEqual({
        isTrusted: false,
        source: 'file',
      });
    });

    it('should return undefined when no rules match', () => {
      fs.writeFileSync(trustedFoldersPath, '{}', 'utf-8');
      expect(
        isWorkspaceTrusted(mockSettings, '/other').isTrusted,
      ).toBeUndefined();
    });

    it('should prioritize IDE override over file config', () => {
      const config = { '/projectA': TrustLevel.DO_NOT_TRUST };
      fs.writeFileSync(trustedFoldersPath, JSON.stringify(config), 'utf-8');

      ideContextStore.set({ workspaceState: { isTrusted: true } });

      try {
        expect(isWorkspaceTrusted(mockSettings, '/projectA')).toEqual({
          isTrusted: true,
          source: 'ide',
        });
      } finally {
        ideContextStore.clear();
      }
    });

    it('should always return true if folderTrust setting is disabled', () => {
      const disabledSettings: Settings = {
        security: { folderTrust: { enabled: false } },
      };
      expect(isWorkspaceTrusted(disabledSettings, '/any')).toEqual({
        isTrusted: true,
        source: undefined,
      });
    });
  });

  describe('Symlinks Support', () => {
    it('should trust a folder if the rule matches the realpath', () => {
      // Create a real directory and a symlink
      const realDir = path.join(tempDir, 'real');
      const symlinkDir = path.join(tempDir, 'symlink');
      fs.mkdirSync(realDir);
      fs.symlinkSync(realDir, symlinkDir);

      // Rule uses realpath
      const config = { [realDir]: TrustLevel.TRUST_FOLDER };
      fs.writeFileSync(trustedFoldersPath, JSON.stringify(config), 'utf-8');

      // Check against symlink path
      expect(isWorkspaceTrusted(mockSettings, symlinkDir).isTrusted).toBe(true);
    });

    const mockSettings: Settings = {
      security: { folderTrust: { enabled: true } },
    };
  });

  describe('Verification: Auth and Trust Interaction', () => {
    it('should verify loadEnvironment returns early when untrusted', () => {
      const untrustedDir = path.join(tempDir, 'untrusted');
      fs.mkdirSync(untrustedDir);

      const config = { [untrustedDir]: TrustLevel.DO_NOT_TRUST };
      fs.writeFileSync(trustedFoldersPath, JSON.stringify(config), 'utf-8');

      const envPath = path.join(untrustedDir, '.env');
      fs.writeFileSync(envPath, 'GEMINI_API_KEY=secret', 'utf-8');

      vi.stubEnv('GEMINI_API_KEY', '');

      const settings = createMockSettings({
        security: { folderTrust: { enabled: true } },
      });

      loadEnvironment(settings.merged, untrustedDir);

      expect(process.env['GEMINI_API_KEY']).toBe('');

      vi.unstubAllEnvs();
    });
  });
});
