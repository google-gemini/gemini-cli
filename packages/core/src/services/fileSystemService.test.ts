/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import { StandardFileSystemService } from './fileSystemService.js';
import * as fileUtils from '../utils/fileUtils.js';

vi.mock('fs/promises');
vi.mock('../utils/fileUtils.js', () => ({
  readFileWithEncoding: vi.fn(),
}));

describe('StandardFileSystemService', () => {
  let fileSystem: StandardFileSystemService;

  beforeEach(() => {
    vi.resetAllMocks();
    fileSystem = new StandardFileSystemService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readTextFile', () => {
    it('should read file content using BOM-aware reader', async () => {
      const testContent = 'Hello, World!';
      vi.mocked(fileUtils.readFileWithEncoding).mockResolvedValue(testContent);

      const result = await fileSystem.readTextFile('/test/file.txt');

      expect(fileUtils.readFileWithEncoding).toHaveBeenCalledWith(
        '/test/file.txt',
      );
      expect(result).toBe(testContent);
    });

    it('should propagate readFileWithEncoding errors', async () => {
      const error = new Error('ENOENT: File not found');
      vi.mocked(fileUtils.readFileWithEncoding).mockRejectedValue(error);

      await expect(fileSystem.readTextFile('/test/file.txt')).rejects.toThrow(
        'ENOENT: File not found',
      );
    });
  });

  describe('writeTextFile', () => {
    it('should write file content using fs', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      await fileSystem.writeTextFile('/test/file.txt', 'Hello, World!');

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/file.txt',
        'Hello, World!',
        'utf-8',
      );
    });
  });
});
