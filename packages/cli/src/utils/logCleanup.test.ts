/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  promises as fs,
  type PathLike,
  type Dirent,
  type Stats,
} from 'node:fs';
import * as path from 'node:path';
import { cleanupBackgroundLogs } from './logCleanup.js';

vi.mock('@google/gemini-cli-core', () => ({
  ShellExecutionService: {
    getLogDir: vi.fn().mockReturnValue('/tmp/gemini/tmp/background-processes'),
  },
  debugLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('node:fs', () => ({
  promises: {
    access: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
  },
}));

describe('logCleanup', () => {
  const logDir = '/tmp/gemini/tmp/background-processes';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip cleanup if the directory does not exist', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

    await cleanupBackgroundLogs();

    expect(fs.access).toHaveBeenCalledWith(logDir);
    expect(fs.readdir).not.toHaveBeenCalled();
  });

  it('should skip cleanup if the directory is empty', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockResolvedValue([]);

    await cleanupBackgroundLogs();

    expect(fs.readdir).toHaveBeenCalledWith(logDir, { withFileTypes: true });
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('should delete log files older than 7 days', async () => {
    const now = Date.now();
    const oldTime = now - 8 * 24 * 60 * 60 * 1000; // 8 days ago
    const newTime = now - 1 * 24 * 60 * 60 * 1000; // 1 day ago

    const entries = [
      { name: 'old.log', isFile: () => true },
      { name: 'new.log', isFile: () => true },
      { name: 'not-a-log.txt', isFile: () => true },
      { name: 'some-dir', isFile: () => false },
    ] as Dirent[];

    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(
      fs.readdir as (
        path: PathLike,
        options: { withFileTypes: true },
      ) => Promise<Dirent[]>,
    ).mockResolvedValue(entries);
    vi.mocked(fs.stat).mockImplementation((filePath: PathLike) => {
      const pathStr = filePath.toString();
      if (pathStr.endsWith('old.log')) {
        return Promise.resolve({ mtime: new Date(oldTime) } as Stats);
      }
      if (pathStr.endsWith('new.log')) {
        return Promise.resolve({ mtime: new Date(newTime) } as Stats);
      }
      return Promise.resolve({ mtime: new Date(now) } as Stats);
    });
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    await cleanupBackgroundLogs();

    expect(fs.unlink).toHaveBeenCalledTimes(1);
    expect(fs.unlink).toHaveBeenCalledWith(path.join(logDir, 'old.log'));
    expect(fs.unlink).not.toHaveBeenCalledWith(path.join(logDir, 'new.log'));
  });

  it('should handle errors during file deletion gracefully', async () => {
    const now = Date.now();
    const oldTime = now - 8 * 24 * 60 * 60 * 1000;

    const entries = [{ name: 'old.log', isFile: () => true }];

    vi.mocked(fs.access).mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readdir).mockResolvedValue(entries as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.stat).mockResolvedValue({ mtime: new Date(oldTime) } as any);
    vi.mocked(fs.unlink).mockRejectedValue(new Error('Permission denied'));

    await expect(cleanupBackgroundLogs()).resolves.not.toThrow();
    expect(fs.unlink).toHaveBeenCalled();
  });
});
