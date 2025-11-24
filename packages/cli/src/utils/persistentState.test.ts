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

  it('should save state to file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    persistentState.set('defaultBannerShownCount', { banner1: 1 });

    expect(fs.mkdirSync).toHaveBeenCalledWith(path.normalize(mockDir), {
      recursive: true,
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      mockFilePath,
      JSON.stringify({ defaultBannerShownCount: { banner1: 1 } }, null, 2),
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

  it('should handle save errors', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('Write error');
    });

    persistentState.set('defaultBannerShownCount', { banner1: 1 });
    expect(debugLogger.warn).toHaveBeenCalled();
  });
});
