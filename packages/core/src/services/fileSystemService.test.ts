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
    it('should write to a sibling temp file and atomically rename into place', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.rename).mockResolvedValue();

      await fileSystem.writeTextFile('/test/file.txt', 'Hello, World!');

      expect(fs.writeFile).toHaveBeenCalledTimes(1);
      const [tmpPathArg, contentArg, encodingArg] = vi.mocked(fs.writeFile).mock
        .calls[0];
      expect(String(tmpPathArg)).toMatch(
        /^\/test\/\.file\.txt\.[0-9a-f-]+\.tmp$/,
      );
      expect(contentArg).toBe('Hello, World!');
      expect(encodingArg).toBe('utf-8');
      expect(fs.rename).toHaveBeenCalledWith(tmpPathArg, '/test/file.txt');
    });

    it('should preserve destination file permissions when replacing an existing file', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        mode: 0o100600,
        isDirectory: () => false,
      } as Awaited<ReturnType<typeof fs.stat>>);
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.chmod).mockResolvedValue();
      vi.mocked(fs.rename).mockResolvedValue();

      await fileSystem.writeTextFile('/test/secret.txt', 'secret');

      const tmpPathArg = vi.mocked(fs.writeFile).mock.calls[0][0];
      expect(fs.chmod).toHaveBeenCalledWith(tmpPathArg, 0o600);
      expect(fs.rename).toHaveBeenCalledWith(tmpPathArg, '/test/secret.txt');
    });

    it('should retry rename on transient EBUSY / EPERM errors', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      const busyErr: NodeJS.ErrnoException = new Error('EBUSY: resource busy');
      busyErr.code = 'EBUSY';
      const permErr: NodeJS.ErrnoException = new Error('EPERM: not permitted');
      permErr.code = 'EPERM';

      vi.mocked(fs.rename)
        .mockRejectedValueOnce(busyErr)
        .mockRejectedValueOnce(permErr)
        .mockResolvedValueOnce();

      await fileSystem.writeTextFile('/test/file.txt', 'Hello!');

      expect(fs.rename).toHaveBeenCalledTimes(3);
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('should unlink the temporary file if rename fails permanently', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      const fatalErr: NodeJS.ErrnoException = new Error('ENOSPC: disk full');
      fatalErr.code = 'ENOSPC';
      vi.mocked(fs.rename).mockRejectedValue(fatalErr);
      vi.mocked(fs.unlink).mockResolvedValue();

      await expect(
        fileSystem.writeTextFile('/test/file.txt', 'Hello!'),
      ).rejects.toThrow('ENOSPC: disk full');

      const tmpPathArg = vi.mocked(fs.writeFile).mock.calls[0][0];
      expect(fs.unlink).toHaveBeenCalledWith(tmpPathArg);
    });
  });
});
