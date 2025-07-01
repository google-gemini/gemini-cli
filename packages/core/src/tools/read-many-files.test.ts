/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { mockControl } from '../__mocks__/fs/promises.js';
import { ReadManyFilesTool, ReadManyFilesParams } from './read-many-files.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import path from 'path';
import fs from 'fs'; // Actual fs for setup
import os from 'os';
import { Config } from '../config/config.js';

describe('ReadManyFilesTool', () => {
  let tool: ReadManyFilesTool;
  let tempRootDir: string;
  let tempDirOutsideRoot: string;
  let mockReadFileFn: Mock;

  const createFile = (filePath: string, content = '') => {
    const fullPath = path.join(tempRootDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  };

  beforeEach(async () => {
    tempRootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'read-many-files-root-'),
    );
    tempDirOutsideRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'read-many-files-external-'),
    );
    fs.writeFileSync(path.join(tempRootDir, '.geminiignore'), 'foo.*');
    const fileService = new FileDiscoveryService(tempRootDir);
    const mockConfig = {
      getFileService: () => fileService,
      getFileFilteringRespectGitIgnore: () => true,
    } as Partial<Config> as Config;

    tool = new ReadManyFilesTool(tempRootDir, mockConfig);

    mockReadFileFn = mockControl.mockReadFile;
    mockReadFileFn.mockReset();

    mockReadFileFn.mockImplementation(
      async (filePath: fs.PathLike, options?: Record<string, unknown>) => {
        const fp =
          typeof filePath === 'string'
            ? filePath
            : (filePath as Buffer).toString();

        if (fs.existsSync(fp)) {
          const originalFs = await vi.importActual<typeof fs>('fs');
          return originalFs.promises.readFile(fp, options);
        }

        if (fp.endsWith('nonexistent-file.txt')) {
          const err = new Error(
            `ENOENT: no such file or directory, open '${fp}'`,
          );
          (err as NodeJS.ErrnoException).code = 'ENOENT';
          throw err;
        }
        if (fp.endsWith('unreadable.txt')) {
          const err = new Error(`EACCES: permission denied, open '${fp}'`);
          (err as NodeJS.ErrnoException).code = 'EACCES';
          throw err;
        }
        if (fp.endsWith('.png'))
          return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
        if (fp.endsWith('.pdf')) return Buffer.from('%PDF-1.4...'); // PDF start
        if (fp.endsWith('binary.bin'))
          return Buffer.from([0x00, 0x01, 0x02, 0x00, 0x03]);

        const err = new Error(
          `ENOENT: no such file or directory, open '${fp}' (unmocked path)`,
        );
        (err as NodeJS.ErrnoException).code = 'ENOENT';
        throw err;
      },
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempDirOutsideRoot)) {
      fs.rmSync(tempDirOutsideRoot, { recursive: true, force: true });
    }
  });

  describe('basic functionality', () => {
    it('should read a single specified file', async () => {
      createFile('file1.txt', 'Content of file1');
      const params = { paths: ['file1.txt'] };
      const result = await tool.execute(params, new AbortController().signal);
      expect(result.llmContent).toEqual([
        '--- file1.txt ---\n\nContent of file1\n\n',
      ]);
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **1 file(s)**',
      );
    });
  });

  describe('validateParams', () => {
    it('should handle null and undefined inputs', () => {
      expect(tool.validateParams(null as unknown as ReadManyFilesParams)).toBe(
        'The "paths" parameter is required and must be a non-empty array of strings/glob patterns.',
      );
      expect(
        tool.validateParams(undefined as unknown as ReadManyFilesParams),
      ).toBe(
        'The "paths" parameter is required and must be a non-empty array of strings/glob patterns.',
      );
    });
  });
});
