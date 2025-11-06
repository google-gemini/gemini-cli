/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { expandHomeDir, loadMemoryFromDirectories } from './directoryUtils.js';
import { loadServerHierarchicalMemory } from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';
import type * as osActual from 'node:os';
import * as path from 'node:path';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    loadServerHierarchicalMemory: vi.fn().mockResolvedValue({
      memoryContent: 'mock memory',
      fileCount: 10,
      filePaths: ['/a/b/c.md'],
    }),
  };
});

const mockHomeDir =
  process.platform === 'win32' ? 'C:\\Users\\testuser' : '/home/testuser';

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof osActual>();
  return {
    ...original,
    homedir: vi.fn(() => mockHomeDir),
  };
});

describe('directoryUtils', () => {
  describe('expandHomeDir', () => {
    it('should expand ~ to the home directory', () => {
      expect(expandHomeDir('~')).toBe(mockHomeDir);
    });

    it('should expand ~/path to the home directory path', () => {
      const expected = path.join(mockHomeDir, 'Documents');
      expect(expandHomeDir('~/Documents')).toBe(expected);
    });

    it('should expand %userprofile% on Windows', () => {
      if (process.platform === 'win32') {
        const expected = path.join(mockHomeDir, 'Desktop');
        expect(expandHomeDir('%userprofile%\\Desktop')).toBe(expected);
      }
    });

    it('should not change a path that does not need expansion', () => {
      const regularPath = '/usr/local/bin';
      expect(expandHomeDir(regularPath)).toBe(regularPath);
    });

    it('should return an empty string if input is empty', () => {
      expect(expandHomeDir('')).toBe('');
    });
  });

  describe('loadMemoryFromDirectories', () => {
    let mockConfig: Config;
    let mockMemoryData: {
      memoryContent: string;
      fileCount: number;
      filePaths: string[];
    };

    let mockSettings: LoadedSettings;

    beforeEach(() => {
      vi.clearAllMocks();

      mockMemoryData = {
        memoryContent: 'mock memory',
        fileCount: 10,
        filePaths: ['/a/b/c.md'],
      };

      vi.mocked(loadServerHierarchicalMemory).mockResolvedValue(mockMemoryData);

      mockConfig = {
        shouldLoadMemoryFromIncludeDirectories: vi.fn().mockReturnValue(true),
        getWorkingDir: vi.fn().mockReturnValue('/test/dir'),
        getWorkspaceContext: vi.fn().mockReturnValue({
          getDirectories: vi.fn().mockReturnValue(['/test/dir/project']),
        }),
        getDebugMode: vi.fn().mockReturnValue(false),
        getFileService: vi.fn().mockReturnValue({}),
        getExtensionLoader: vi.fn().mockReturnValue({
          getExtensions: vi.fn().mockReturnValue([]),
        }),
        getFolderTrust: vi.fn().mockReturnValue(true),
        getFileFilteringOptions: vi.fn().mockReturnValue({}),
        setUserMemory: vi.fn(),
        setGeminiMdFileCount: vi.fn(),
      } as unknown as Config;

      mockSettings = {
        merged: {
          context: {
            importFormat: 'tree',
            discoveryMaxDirs: 1000,
          },
        },
      } as unknown as LoadedSettings;
    });

    it('should return undefined if shouldLoadMemoryFromIncludeDirectories is false', async () => {
      vi.mocked(
        mockConfig.shouldLoadMemoryFromIncludeDirectories,
      ).mockReturnValue(false);

      const result = await loadMemoryFromDirectories(mockConfig, mockSettings);

      expect(result).toBeUndefined();
      expect(loadServerHierarchicalMemory).not.toHaveBeenCalled();
    });

    it('should call loadServerHierarchicalMemory and update config', async () => {
      const result = await loadMemoryFromDirectories(mockConfig, mockSettings);

      expect(loadServerHierarchicalMemory).toHaveBeenCalledWith(
        '/test/dir',
        ['/test/dir/project'],
        false,
        {},
        {
          getExtensions: expect.any(Function),
        },
        true,
        'tree',
        {},
        1000,
      );
      expect(mockConfig.setUserMemory).toHaveBeenCalledWith(
        mockMemoryData.memoryContent,
      );
      expect(mockConfig.setGeminiMdFileCount).toHaveBeenCalledWith(
        mockMemoryData.fileCount,
      );
      expect(result).toEqual({
        memoryContent: 'mock memory',
        fileCount: 10,
      });
    });

    it('should throw an error if loadServerHierarchicalMemory fails', async () => {
      const testError = new Error('Failed to load memory');
      vi.mocked(loadServerHierarchicalMemory).mockRejectedValue(testError);

      await expect(
        loadMemoryFromDirectories(mockConfig, mockSettings),
      ).rejects.toThrow(testError);

      expect(mockConfig.setUserMemory).not.toHaveBeenCalled();
      expect(mockConfig.setGeminiMdFileCount).not.toHaveBeenCalled();
    });
  });
});
