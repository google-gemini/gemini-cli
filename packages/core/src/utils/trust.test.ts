/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  TrustLevel,
  loadTrustedFolders,
  resetTrustedFoldersForTesting,
  checkPathTrust,
} from './trust.js';
import { Storage } from '../config/storage.js';
import { lock } from 'proper-lockfile';
import { ideContextStore } from '../ide/ideContext.js';
import * as headless from './headless.js';
import { coreEvents } from './events.js';

vi.mock('proper-lockfile');
vi.mock('./headless.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./headless.js')>();
  return {
    ...original,
    isHeadlessMode: vi.fn(),
  };
});

describe('Trust Utility (Core)', () => {
  const tempDir = path.join(
    os.tmpdir(),
    'gemini-trust-test-' + Math.random().toString(36).slice(2),
  );
  const trustedFoldersPath = path.join(tempDir, 'trustedFolders.json');

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    vi.spyOn(Storage, 'getTrustedFoldersPath').mockReturnValue(
      trustedFoldersPath,
    );
    vi.mocked(lock).mockResolvedValue(vi.fn().mockResolvedValue(undefined));
    vi.mocked(headless.isHeadlessMode).mockReturnValue(false);
    ideContextStore.clear();
    resetTrustedFoldersForTesting();
    delete process.env['GEMINI_CLI_TRUST_WORKSPACE'];
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should load empty config if file does not exist', () => {
    const folders = loadTrustedFolders();
    expect(folders.user.config).toEqual({});
    expect(folders.errors).toEqual([]);
  });

  it('should load config from file', () => {
    const config = {
      [path.resolve('/trusted/path')]: TrustLevel.TRUST_FOLDER,
    };
    fs.writeFileSync(trustedFoldersPath, JSON.stringify(config));

    const folders = loadTrustedFolders();
    // Use path.resolve for platform consistency in tests
    const normalizedKey = path.resolve('/trusted/path').replace(/\\/g, '/');
    const isWindows = process.platform === 'win32';
    const finalKey = isWindows ? normalizedKey.toLowerCase() : normalizedKey;

    expect(folders.user.config[finalKey]).toBe(TrustLevel.TRUST_FOLDER);
  });

  it('should handle isPathTrusted with longest match', () => {
    const config = {
      [path.resolve('/a')]: TrustLevel.TRUST_FOLDER,
      [path.resolve('/a/b')]: TrustLevel.DO_NOT_TRUST,
      [path.resolve('/a/b/c')]: TrustLevel.TRUST_FOLDER,
    };
    fs.writeFileSync(trustedFoldersPath, JSON.stringify(config));

    const folders = loadTrustedFolders();

    expect(folders.isPathTrusted(path.resolve('/a/file.txt'))).toBe(true);
    expect(folders.isPathTrusted(path.resolve('/a/b/file.txt'))).toBe(false);
    expect(folders.isPathTrusted(path.resolve('/a/b/c/file.txt'))).toBe(true);
    expect(folders.isPathTrusted(path.resolve('/other'))).toBeUndefined();
  });

  it('should handle TRUST_PARENT', () => {
    const config = {
      [path.resolve('/project/.gemini')]: TrustLevel.TRUST_PARENT,
    };
    fs.writeFileSync(trustedFoldersPath, JSON.stringify(config));

    const folders = loadTrustedFolders();

    expect(folders.isPathTrusted(path.resolve('/project/file.txt'))).toBe(true);
    expect(
      folders.isPathTrusted(path.resolve('/project/.gemini/config.yaml')),
    ).toBe(true);
  });

  it('should save config correctly', async () => {
    const folders = loadTrustedFolders();
    const testPath = path.resolve('/new/trusted/path');
    await folders.setValue(testPath, TrustLevel.TRUST_FOLDER);

    const savedContent = JSON.parse(
      fs.readFileSync(trustedFoldersPath, 'utf-8'),
    );
    const normalizedKey = testPath.replace(/\\/g, '/');
    const isWindows = process.platform === 'win32';
    const finalKey = isWindows ? normalizedKey.toLowerCase() : normalizedKey;

    expect(savedContent[finalKey]).toBe(TrustLevel.TRUST_FOLDER);
  });

  it('should handle comments in JSON', () => {
    const content = `
    {
      // This is a comment
      "path": "TRUST_FOLDER"
    }
    `;
    fs.writeFileSync(trustedFoldersPath, content);

    const folders = loadTrustedFolders();
    expect(folders.errors).toHaveLength(0);
  });

  describe('checkPathTrust', () => {
    it('should NOT return trusted if headless mode is on by default', () => {
      const result = checkPathTrust({
        path: '/any',
        isFolderTrustEnabled: true,
        isHeadless: true,
      });
      expect(result).toEqual({ isTrusted: undefined, source: undefined });
    });

    it('should return trusted if folder trust is disabled', () => {
      const result = checkPathTrust({
        path: '/any',
        isFolderTrustEnabled: false,
      });
      expect(result).toEqual({ isTrusted: true, source: undefined });
    });

    it('should return IDE trust if available', () => {
      ideContextStore.set({
        workspaceState: { isTrusted: true },
      });
      const result = checkPathTrust({
        path: '/any',
        isFolderTrustEnabled: true,
      });
      expect(result).toEqual({ isTrusted: true, source: 'ide' });
    });

    it('should fall back to file trust', () => {
      const config = {
        [path.resolve('/trusted')]: TrustLevel.TRUST_FOLDER,
      };
      fs.writeFileSync(trustedFoldersPath, JSON.stringify(config));

      const result = checkPathTrust({
        path: path.resolve('/trusted/file.txt'),
        isFolderTrustEnabled: true,
      });
      expect(result).toEqual({ isTrusted: true, source: 'file' });
    });

    it('should return undefined trust if no rule matches', () => {
      const result = checkPathTrust({
        path: '/any',
        isFolderTrustEnabled: true,
      });
      expect(result).toEqual({ isTrusted: undefined, source: undefined });
    });
  });

  describe('coreEvents.emitFeedback', () => {
    it('should report corrupted config via coreEvents.emitFeedback in setValue', async () => {
      const folders = loadTrustedFolders();
      const testPath = path.resolve('/new/path');

      // Initialize with valid JSON
      fs.writeFileSync(trustedFoldersPath, '{}', 'utf-8');

      // Corrupt the file after initial load
      fs.writeFileSync(trustedFoldersPath, 'invalid json', 'utf-8');

      const spy = vi.spyOn(coreEvents, 'emitFeedback');
      await folders.setValue(testPath, TrustLevel.TRUST_FOLDER);

      expect(spy).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('may be corrupted'),
        expect.any(Error),
      );
    });
  });
});
