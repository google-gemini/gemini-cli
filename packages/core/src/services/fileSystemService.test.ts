/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import { StandardFileSystemService } from './fileSystemService.js';

vi.mock('fs/promises');

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
    it('should read file content using fs', async () => {
      const testContent = 'Hello, World!';
      vi.mocked(fs.readFile).mockResolvedValue(testContent);

      const result = await fileSystem.readTextFile('/test/file.txt');

      expect(fs.readFile).toHaveBeenCalledWith('/test/file.txt', 'utf-8');
      expect(result).toBe(testContent);
    });

    it('should propagate fs.readFile errors', async () => {
      const error = new Error('ENOENT: File not found');
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(fileSystem.readTextFile('/test/file.txt')).rejects.toThrow(
        'ENOENT: File not found',
      );
    });
  });

  describe('writeTextFile', () => {
    it('should write to a sibling temp file and rename it into place', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.rename).mockResolvedValue();
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));

      await fileSystem.writeTextFile('/test/file.txt', 'Hello, World!');

      const [tmpPath, content, options] = vi.mocked(fs.writeFile).mock
        .calls[0] as [string, string, { encoding: string }];
      expect(content).toBe('Hello, World!');
      expect(options.encoding).toBe('utf-8');
      expect(tmpPath).toMatch(/^\/test\/file\.txt\..*\.tmp$/);
      expect(fs.rename).toHaveBeenCalledWith(tmpPath, '/test/file.txt');
    });

    it('should create the temp file with the destination permissions', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.rename).mockResolvedValue();
      vi.mocked(fs.chmod).mockResolvedValue();
      vi.mocked(fs.stat).mockResolvedValue({
        mode: 0o600,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);

      await fileSystem.writeTextFile('/test/secret.txt', 'Hello, World!');

      // Creating the temp file already restricted means the content is never
      // briefly readable through a wider default mode.
      const [, , options] = vi.mocked(fs.writeFile).mock.calls[0];
      expect(options).toEqual({ encoding: 'utf-8', mode: 0o600 });
    });

    it('should still write the file when chmod is not permitted', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.rename).mockResolvedValue();
      vi.mocked(fs.rm).mockResolvedValue();
      vi.mocked(fs.stat).mockResolvedValue({
        mode: 0o600,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);
      // FAT32/exFAT, some NFS/CIFS mounts and restricted sandboxes reject chmod.
      vi.mocked(fs.chmod).mockRejectedValue(
        Object.assign(new Error('operation not supported'), {
          code: 'ENOTSUP',
        }),
      );

      await expect(
        fileSystem.writeTextFile('/test/file.txt', 'Hello, World!'),
      ).resolves.toBeUndefined();

      expect(fs.rename).toHaveBeenCalled();
      expect(fs.rm).not.toHaveBeenCalled();
    });

    it('should remove the temp file when the write fails', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('ENOSPC'));
      vi.mocked(fs.rm).mockResolvedValue();

      await expect(
        fileSystem.writeTextFile('/test/file.txt', 'Hello, World!'),
      ).rejects.toThrow('ENOSPC');

      expect(fs.rename).not.toHaveBeenCalled();
      const [removed] = vi.mocked(fs.rm).mock.calls[0] as [string];
      expect(removed).toMatch(/^\/test\/file\.txt\..*\.tmp$/);
    });
  });
});
