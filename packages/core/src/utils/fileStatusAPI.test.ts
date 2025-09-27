/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FileStatusAPI,
  getFileStatusAPI,
  isFileStale,
  getStaleFiles,
} from './fileStatusAPI.js';
import { FileTrackerService, FileStatus } from './fileTrackerService.js';

vi.mock('./fileTrackerService.js');

describe('FileStatusAPI', () => {
  let api: FileStatusAPI;
  let mockService: vi.Mocked<FileTrackerService>;

  beforeEach(() => {
    vi.clearAllMocks();
    api = new FileStatusAPI();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = FileStatusAPI.getInstance();
      const instance2 = FileStatusAPI.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should work with convenience function', () => {
      const instance1 = FileStatusAPI.getInstance();
      const instance2 = getFileStatusAPI();

      expect(instance1).toBe(instance2);
    });
  });

  describe('getFileStatus', () => {
    it('should delegate to service', () => {
      const mockEntry = {
        path: '/test/file.txt',
        state: { content: 'test', mtime: new Date(), size: 4 },
        status: FileStatus.READ_CURRENT,
        firstReadAt: new Date(),
        lastUpdatedAt: new Date(),
      };

      vi.mocked(api['service']).getFileStatus.mockReturnValue(mockEntry);

      const result = api.getFileStatus('/test/file.txt');

      expect(api['service'].getFileStatus).toHaveBeenCalledWith(
        '/test/file.txt',
      );
      expect(result).toBe(mockEntry);
    });
  });

  describe('isFileStale', () => {
    it('should delegate to service and return true for stale files', async () => {
      vi.mocked(api['service']).isFileStale.mockResolvedValue(true);

      const result = await api.isFileStale('/test/file.txt');

      expect(api['service'].isFileStale).toHaveBeenCalledWith('/test/file.txt');
      expect(result).toBe(true);
    });

    it('should work with convenience function', async () => {
      vi.mocked(api['service']).isFileStale.mockResolvedValue(false);

      const result = await isFileStale('/test/file.txt');

      expect(result).toBe(false);
    });
  });

  describe('getStaleFiles', () => {
    it('should return stale files from service', () => {
      const mockEntries = [
        {
          path: '/test/file1.txt',
          state: { content: 'test1', mtime: new Date(), size: 5 },
          status: FileStatus.READ_STALE,
          firstReadAt: new Date(),
          lastUpdatedAt: new Date(),
        },
      ];

      vi.mocked(api['service']).getFilesByStatus.mockReturnValue(mockEntries);

      const result = api.getStaleFiles();

      expect(api['service'].getFilesByStatus).toHaveBeenCalledWith(
        FileStatus.READ_STALE,
      );
      expect(result).toEqual(mockEntries);
    });

    it('should work with convenience function', () => {
      const mockEntries = [
        {
          path: '/test/file1.txt',
          state: { content: 'test1', mtime: new Date(), size: 5 },
          status: FileStatus.READ_STALE,
          firstReadAt: new Date(),
          lastUpdatedAt: new Date(),
        },
      ];

      vi.mocked(api['service']).getFilesByStatus.mockReturnValue(mockEntries);

      const result = getStaleFiles();

      expect(api['service'].getFilesByStatus).toHaveBeenCalledWith(
        FileStatus.READ_STALE,
      );
      expect(result).toEqual(mockEntries);
    });
  });

  describe('getCurrentFiles', () => {
    it('should return current files from service', () => {
      const mockEntries = [
        {
          path: '/test/file1.txt',
          state: { content: 'test1', mtime: new Date(), size: 5 },
          status: FileStatus.READ_CURRENT,
          firstReadAt: new Date(),
          lastUpdatedAt: new Date(),
        },
      ];

      vi.mocked(api['service']).getFilesByStatus.mockReturnValue(mockEntries);

      const result = api.getCurrentFiles();

      expect(api['service'].getFilesByStatus).toHaveBeenCalledWith(
        FileStatus.READ_CURRENT,
      );
      expect(result).toEqual(mockEntries);
    });
  });

  describe('getAllReadFiles', () => {
    it('should return all read files (current + stale)', () => {
      const currentEntries = [
        {
          path: '/test/file1.txt',
          state: { content: 'test1', mtime: new Date(), size: 5 },
          status: FileStatus.READ_CURRENT,
          firstReadAt: new Date(),
          lastUpdatedAt: new Date(),
        },
      ];

      const staleEntries = [
        {
          path: '/test/file2.txt',
          state: { content: 'test2', mtime: new Date(), size: 5 },
          status: FileStatus.READ_STALE,
          firstReadAt: new Date(),
          lastUpdatedAt: new Date(),
        },
      ];

      const allEntries = [...currentEntries, ...staleEntries];

      vi.mocked(api['service'])
        .getFilesByStatus.mockReturnValueOnce(currentEntries) // First call for READ_CURRENT
        .mockReturnValueOnce(staleEntries); // Second call for READ_STALE

      const result = api.getAllReadFiles();

      expect(result).toEqual(allEntries);
    });
  });

  describe('getStats', () => {
    it('should delegate to service', () => {
      const mockStats = {
        [FileStatus.READ_CURRENT]: 5,
        [FileStatus.READ_STALE]: 2,
        [FileStatus.NOT_READ]: 0,
        [FileStatus.READ_ERROR]: 1,
      };

      vi.mocked(api['service']).getStats.mockReturnValue(mockStats);

      const result = api.getStats();

      expect(api['service'].getStats).toHaveBeenCalled();
      expect(result).toEqual(mockStats);
    });
  });

  describe('getSummary', () => {
    it('should provide summary statistics', () => {
      const mockStats = {
        [FileStatus.READ_CURRENT]: 5,
        [FileStatus.READ_STALE]: 2,
        [FileStatus.NOT_READ]: 0,
        [FileStatus.READ_ERROR]: 1,
      };

      vi.mocked(api['service']).getStats.mockReturnValue(mockStats);

      const result = api.getSummary();

      expect(result).toEqual({
        totalTracked: 8,
        currentFiles: 5,
        staleFiles: 2,
        errorFiles: 1,
      });
    });
  });

  describe('getFilesNeedingAttention', () => {
    it('should return stale and error files', () => {
      const staleEntries = [
        {
          path: '/test/file1.txt',
          state: { content: 'test1', mtime: new Date(), size: 5 },
          status: FileStatus.READ_STALE,
          firstReadAt: new Date(),
          lastUpdatedAt: new Date(),
        },
      ];

      const errorEntries = [
        {
          path: '/test/file2.txt',
          state: { content: 'test2', mtime: new Date(), size: 5 },
          status: FileStatus.READ_ERROR,
          firstReadAt: new Date(),
          lastUpdatedAt: new Date(),
          error: 'Permission denied',
        },
      ];

      const allAttentionEntries = [...staleEntries, ...errorEntries];

      vi.mocked(api['service'])
        .getFilesByStatus.mockReturnValueOnce(staleEntries) // First call for READ_STALE
        .mockReturnValueOnce(errorEntries); // Second call for READ_ERROR

      const result = api.getFilesNeedingAttention();

      expect(result).toEqual(allAttentionEntries);
    });
  });
});
