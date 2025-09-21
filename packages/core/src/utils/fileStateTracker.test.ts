/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileStateTracker, type FileState, type FileFreshnessResult } from './fileStateTracker.js';

vi.mock('node:fs/promises');

describe('FileStateTracker', () => {
  let tempDir: string;
  let tracker: FileStateTracker;

  beforeEach(() => {
    vi.resetAllMocks();
    tempDir = path.join(os.tmpdir(), 'file-state-tracker-test');
    tracker = new FileStateTracker();
  });

  afterEach(async () => {
    // Clean up any created temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getFileState', () => {
    it('should get file state correctly', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const testContent = 'Hello, World!';
      const mockStats = {
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: testContent.length,
      };

      vi.mocked(fs.stat).mockResolvedValue(mockStats as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(testContent);

      const state = await tracker.getFileState(filePath);

      expect(fs.stat).toHaveBeenCalledWith(filePath);
      expect(fs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
      expect(state).toEqual({
        content: testContent,
        mtime: mockStats.mtime,
        size: mockStats.size,
      });
    });

    it('should include hash when useContentHash is enabled', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const testContent = 'Hello, World!';
      const mockStats = {
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: testContent.length,
      };

      const hashTracker = new FileStateTracker({ useContentHash: true });
      vi.mocked(fs.stat).mockResolvedValue(mockStats as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(testContent);

      const state = await hashTracker.getFileState(filePath);

      expect(state.hash).toBeDefined();
      expect(state.hash).toHaveLength(64); // SHA-256 hash length
      expect(state.hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should throw error for non-existent file', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');
      const error = new Error('ENOENT: File not found');
      (error as NodeJS.ErrnoException).code = 'ENOENT';

      vi.mocked(fs.stat).mockRejectedValue(error);

      await expect(tracker.getFileState(filePath)).rejects.toThrow(
        'File not found',
      );
    });

    it('should throw error for other file system errors', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const error = new Error('EACCES: Permission denied');

      vi.mocked(fs.stat).mockRejectedValue(error);

      await expect(tracker.getFileState(filePath)).rejects.toThrow(
        'Failed to read file',
      );
    });
  });

  describe('checkFreshness', () => {
    it('should return isFresh=true for unchanged file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const originalContent = 'Hello, World!';
      const originalState: FileState = {
        content: originalContent,
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: originalContent.length,
      };

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: originalState.mtime,
        size: originalState.size,
      } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(originalContent);

      const result = await tracker.checkFreshness(filePath, originalState);

      expect(result.isFresh).toBe(true);
      expect(result.originalState).toBe(originalState);
      expect(result.currentState).toEqual(originalState);
    });

    it('should detect size changes', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const originalContent = 'Hello, World!';
      const modifiedContent = 'Hello, World! This is modified content.';
      const originalState: FileState = {
        content: originalContent,
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: originalContent.length,
      };

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: originalState.mtime,
        size: modifiedContent.length,
      } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(modifiedContent);

      const result = await tracker.checkFreshness(filePath, originalState);

      expect(result.isFresh).toBe(false);
      expect(result.changeDescription).toBe('file size changed');
      expect(result.originalState).toBe(originalState);
      expect(result.currentState?.size).toBe(modifiedContent.length);
    });

    it('should detect modification time changes', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const originalContent = 'Hello, World!';
      const originalState: FileState = {
        content: originalContent,
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: originalContent.length,
      };

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: new Date('2024-01-01T12:30:00Z'),
        size: originalState.size,
      } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(originalContent);

      const result = await tracker.checkFreshness(filePath, originalState);

      expect(result.isFresh).toBe(false);
      expect(result.changeDescription).toBe('file modification time changed');
    });

    it('should detect content changes', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const originalContent = 'Hello, World!';
      const modifiedContent = 'Hello, Universe!';
      const originalState: FileState = {
        content: originalContent,
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: originalContent.length,
      };

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: originalState.mtime,
        size: originalState.size,
      } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(modifiedContent);

      const result = await tracker.checkFreshness(filePath, originalState);

      expect(result.isFresh).toBe(false);
      expect(result.changeDescription).toBe('file content changed');
      expect(result.diff).toBeDefined();
    });

    it('should detect file deletion', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const originalContent = 'Hello, World!';
      const originalState: FileState = {
        content: originalContent,
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: originalContent.length,
      };

      const error = new Error('ENOENT: File not found');
      (error as NodeJS.ErrnoException).code = 'ENOENT';

      vi.mocked(fs.stat).mockRejectedValue(error);

      const result = await tracker.checkFreshness(filePath, originalState);

      expect(result.isFresh).toBe(false);
      expect(result.changeDescription).toContain('File not found');
      expect(result.currentState).toBeUndefined();
    });

    it('should handle file system errors gracefully', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const originalContent = 'Hello, World!';
      const originalState: FileState = {
        content: originalContent,
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: originalContent.length,
      };

      const error = new Error('EACCES: Permission denied');

      vi.mocked(fs.stat).mockRejectedValue(error);

      const result = await tracker.checkFreshness(filePath, originalState);

      expect(result.isFresh).toBe(false);
      expect(result.changeDescription).toContain('Error checking file:');
      expect(result.changeDescription).toContain('EACCES: Permission denied');
    });
  });

  describe('isFileStateCurrent', () => {
    it('should return true for current file state', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const expectedState = {
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: 10,
      };

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: expectedState.mtime,
        size: expectedState.size,
      } as fs.Stats);

      const isCurrent = await tracker.isFileStateCurrent(
        filePath,
        expectedState,
      );

      expect(isCurrent).toBe(true);
    });

    it('should return false for changed file state', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const expectedState = {
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: 10,
      };

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: new Date('2024-01-01T12:30:00Z'),
        size: 20,
      } as fs.Stats);

      const isCurrent = await tracker.isFileStateCurrent(
        filePath,
        expectedState,
      );

      expect(isCurrent).toBe(false);
    });

    it('should return false for file system errors', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const expectedState = {
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: 10,
      };

      const error = new Error('ENOENT: File not found');
      (error as NodeJS.ErrnoException).code = 'ENOENT';

      vi.mocked(fs.stat).mockRejectedValue(error);

      const isCurrent = await tracker.isFileStateCurrent(
        filePath,
        expectedState,
      );

      expect(isCurrent).toBe(false);
    });
  });

  describe('with hash-based comparison', () => {
    let hashTracker: FileStateTracker;

    beforeEach(() => {
      hashTracker = new FileStateTracker({ useContentHash: true });
    });

    it('should detect content changes even with same size and mtime', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const originalContent = 'Hello, World!';
      const modifiedContent = 'Hello, world!'; // Different case, same length
      const originalState: FileState = {
        content: originalContent,
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: originalContent.length,
        hash: hashTracker['computeHash'](originalContent),
      };

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: originalState.mtime,
        size: originalState.size,
      } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(modifiedContent);

      const result = await hashTracker.checkFreshness(filePath, originalState);

      expect(result.isFresh).toBe(false);
      expect(result.changeDescription).toBe('file content changed');
    });
  });

  describe('without diff generation', () => {
    let noDiffTracker: FileStateTracker;

    beforeEach(() => {
      noDiffTracker = new FileStateTracker({ generateDiffs: false });
    });

    it('should not generate diff when disabled', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      const originalContent = 'Hello, World!';
      const modifiedContent = 'Hello, Universe!';
      const originalState: FileState = {
        content: originalContent,
        mtime: new Date('2024-01-01T12:00:00Z'),
        size: originalContent.length,
      };

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: originalState.mtime,
        size: originalState.size,
      } as fs.Stats);
      vi.mocked(fs.readFile).mockResolvedValue(modifiedContent);

      const result = await noDiffTracker.checkFreshness(
        filePath,
        originalState,
      );

      expect(result.isFresh).toBe(false);
      expect(result.diff).toBeUndefined();
    });
  });
});
