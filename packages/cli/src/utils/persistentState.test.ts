/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Storage, debugLogger } from '@google/gemini-cli-core';
import { PersistentState } from './persistentState.js';

vi.mock('node:fs');
vi.mock('@google/gemini-cli-core', () => ({
  Storage: {
    getGlobalGeminiDir: vi.fn(),
  },
  debugLogger: {
    warn: vi.fn(),
  },
}));

describe('PersistentState', () => {
  let persistentState: PersistentState;
  const mockDir = '/mock/dir';
  const mockFilePath = path.join(mockDir, 'state.json');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(Storage.getGlobalGeminiDir).mockReturnValue(mockDir);
    persistentState = new PersistentState();
  });

  it('should load state from file if it exists', () => {
    const mockData = { defaultBannerShownCount: { banner1: 1 } };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockData));

    const value = persistentState.get('defaultBannerShownCount');
    expect(value).toEqual(mockData.defaultBannerShownCount);
    expect(fs.readFileSync).toHaveBeenCalledWith(mockFilePath, 'utf-8');
  });

  it('should return undefined if key does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const value = persistentState.get('defaultBannerShownCount');
    expect(value).toBeUndefined();
  });

  it('should save state atomically to file', () => {
    const mockFd = 42;
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.openSync).mockReturnValue(mockFd);

    persistentState.set('defaultBannerShownCount', { banner1: 1 });

    expect(fs.mkdirSync).toHaveBeenCalledWith(path.normalize(mockDir), {
      recursive: true,
    });
    expect(fs.openSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.state\.json\..*\.tmp$/),
      'w',
      0o600,
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      mockFd,
      JSON.stringify({ defaultBannerShownCount: { banner1: 1 } }, null, 2),
      'utf-8',
    );
    expect(fs.fsyncSync).toHaveBeenCalledWith(mockFd);
    expect(fs.closeSync).toHaveBeenCalledWith(mockFd);
    expect(fs.renameSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.state\.json\..*\.tmp$/),
      mockFilePath,
    );
  });

  it('should create a backup file when saving over an existing state file', () => {
    const mockFd = 42;
    vi.mocked(fs.existsSync).mockImplementation((p) => p === mockFilePath);
    vi.mocked(fs.openSync).mockReturnValue(mockFd);

    persistentState.set('defaultBannerShownCount', { banner1: 1 });

    expect(fs.copyFileSync).toHaveBeenCalledWith(
      mockFilePath,
      `${mockFilePath}.bak`,
    );
    expect(fs.renameSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.state\.json\..*\.tmp$/),
      mockFilePath,
    );
  });

  it('should handle load errors, preserve corrupt file, and start fresh if no backup', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === mockFilePath);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Read error');
    });

    const value = persistentState.get('defaultBannerShownCount');
    expect(value).toBeUndefined();
    expect(debugLogger.warn).toHaveBeenCalled();
    expect(fs.renameSync).toHaveBeenCalledWith(
      mockFilePath,
      `${mockFilePath}.corrupt`,
    );
  });

  it('should unlink existing corrupt file before renaming on load error', () => {
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p === mockFilePath || p === `${mockFilePath}.corrupt`,
    );
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Read error');
    });

    const value = persistentState.get('defaultBannerShownCount');
    expect(value).toBeUndefined();
    expect(fs.unlinkSync).toHaveBeenCalledWith(`${mockFilePath}.corrupt`);
    expect(fs.renameSync).toHaveBeenCalledWith(
      mockFilePath,
      `${mockFilePath}.corrupt`,
    );
  });

  it('should unlink corrupt file if rename fails', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === mockFilePath);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Read error');
    });
    vi.mocked(fs.renameSync).mockImplementation(() => {
      throw new Error('Rename error');
    });

    const value = persistentState.get('defaultBannerShownCount');
    expect(value).toBeUndefined();
    expect(fs.unlinkSync).toHaveBeenCalledWith(mockFilePath);
  });

  it('should recover state from backup if primary file fails to load', () => {
    const backupData = { defaultBannerShownCount: { banner1: 5 } };
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => p === mockFilePath || p === `${mockFilePath}.bak`,
    );
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === mockFilePath) {
        throw new Error('Corrupt state');
      }
      if (p === `${mockFilePath}.bak`) {
        return JSON.stringify(backupData);
      }
      throw new Error('File not found');
    });

    const value = persistentState.get('defaultBannerShownCount');
    expect(value).toEqual(backupData.defaultBannerShownCount);
    expect(debugLogger.warn).toHaveBeenCalledWith(
      'Recovered persistent state from backup',
    );
  });

  it('should handle save errors and clean up temporary file', () => {
    const mockFd = 42;
    vi.mocked(fs.openSync).mockReturnValue(mockFd);
    vi.mocked(fs.renameSync).mockImplementation(() => {
      throw new Error('Rename error');
    });
    vi.mocked(fs.existsSync).mockImplementation(
      (p) => typeof p === 'string' && p.endsWith('.tmp'),
    );

    persistentState.set('defaultBannerShownCount', { banner1: 1 });

    expect(debugLogger.warn).toHaveBeenCalledWith(
      'Failed to save persistent state:',
      expect.any(Error),
    );
    expect(fs.unlinkSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.state\.json\..*\.tmp$/),
    );
  });
});
