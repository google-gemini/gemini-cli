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
  let mockFileHandle: {
    writeFile: ReturnType<typeof vi.fn>;
    sync: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  const mockDir = '/mock/dir';
  const mockFilePath = path.join(mockDir, 'state.json');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(Storage.getGlobalGeminiDir).mockReturnValue(mockDir);
    mockFileHandle = {
      writeFile: vi.fn().mockResolvedValue(undefined),
      sync: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.promises.open).mockResolvedValue(
      mockFileHandle as unknown as fs.promises.FileHandle,
    );
    vi.mocked(fs.promises.copyFile).mockResolvedValue(undefined);
    vi.mocked(fs.promises.rename).mockResolvedValue(undefined);
    vi.mocked(fs.promises.unlink).mockResolvedValue(undefined);
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

  it('should save state through a temporary file and publish it atomically', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await persistentState.set('defaultBannerShownCount', { banner1: 1 });

    expect(fs.promises.mkdir).toHaveBeenCalledWith(path.normalize(mockDir), {
      recursive: true,
    });
    expect(fs.promises.open).toHaveBeenCalledWith(
      expect.stringMatching(/state\.json\..+\.tmp$/),
      'wx',
    );
    expect(mockFileHandle.writeFile).toHaveBeenCalledWith(
      JSON.stringify({ defaultBannerShownCount: { banner1: 1 } }, null, 2),
      'utf-8',
    );
    expect(mockFileHandle.sync).toHaveBeenCalled();
    expect(mockFileHandle.close).toHaveBeenCalled();
    expect(fs.promises.rename).toHaveBeenCalledWith(
      expect.stringMatching(/state\.json\..+\.tmp$/),
      mockFilePath,
    );
  });

  it('should keep the previous state in a backup before replacing it', async () => {
    await persistentState.set('defaultBannerShownCount', { banner1: 1 });

    expect(fs.promises.copyFile).toHaveBeenCalledWith(
      mockFilePath,
      `${mockFilePath}.bak`,
    );
  });

  it('should handle load errors and start fresh', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Read error');
    });

    const value = persistentState.get('defaultBannerShownCount');
    expect(value).toBeUndefined();
    expect(debugLogger.warn).toHaveBeenCalled();
  });

  it('should preserve corrupt state and restore the backup', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((filePath) =>
      filePath === mockFilePath ? '{"broken":' : '{"tipsShown": 2}',
    );

    const value = persistentState.get('defaultBannerShownCount');

    expect(value).toBeUndefined();
    expect(persistentState.get('tipsShown')).toBe(2);
    expect(fs.renameSync).toHaveBeenCalledWith(
      mockFilePath,
      `${mockFilePath}.corrupt`,
    );
    expect(debugLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('corrupt'),
      expect.any(Error),
    );
  });

  it('should handle save errors', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.promises.open).mockRejectedValue(new Error('Write error'));

    await persistentState.set('defaultBannerShownCount', { banner1: 1 });
    expect(debugLogger.warn).toHaveBeenCalled();
  });
});
