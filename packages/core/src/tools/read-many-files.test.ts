/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { mockControl } from '../__mocks__/fs/promises.js';
import { ReadManyFilesTool } from './read-many-files.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import path from 'path';
import fs from 'fs'; // Actual fs for setup
import os from 'os';
import { Config } from '../config/config.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';

vi.mock('mime-types', () => {
  const lookup = (filename: string) => {
    if (filename.endsWith('.ts') || filename.endsWith('.js')) {
      return 'text/plain';
    }
    if (filename.endsWith('.png')) {
      return 'image/png';
    }
    if (filename.endsWith('.pdf')) {
      return 'application/pdf';
    }
    if (filename.endsWith('.mp3') || filename.endsWith('.wav')) {
      return 'audio/mpeg';
    }
    if (filename.endsWith('.mp4') || filename.endsWith('.mov')) {
      return 'video/mp4';
    }
    return false;
  };
  return {
    default: {
      lookup,
    },
    lookup,
  };
});

describe('ReadManyFilesTool', () => {
  let tool: ReadManyFilesTool;
  let tempRootDir: string;
  let tempDirOutsideRoot: string;
  let mockReadFileFn: Mock;

  beforeEach(async () => {
    tempRootDir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'read-many-files-root-')),
    );
    tempDirOutsideRoot = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'read-many-files-external-')),
    );
    fs.writeFileSync(path.join(tempRootDir, '.geminiignore'), 'foo.*');
    const fileService = new FileDiscoveryService(tempRootDir);
    const mockConfig = {
      getFileService: () => fileService,

      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
      getTargetDir: () => tempRootDir,
      getWorkspaceDirs: () => [tempRootDir],
      getWorkspaceContext: () => new WorkspaceContext(tempRootDir),
    } as Partial<Config> as Config;
    tool = new ReadManyFilesTool(mockConfig);

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

  describe('build', () => {
    it('should return an invocation for valid relative paths within root', () => {
      const params = { paths: ['file1.txt', 'subdir/file2.txt'] };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should return an invocation for valid glob patterns within root', () => {
      const params = { paths: ['*.txt', 'subdir/**/*.js'] };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should return an invocation for paths trying to escape the root (e.g., ../) as execute handles this', () => {
      const params = { paths: ['../outside.txt'] };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should return an invocation for absolute paths as execute handles this', () => {
      const params = { paths: [path.join(tempDirOutsideRoot, 'absolute.txt')] };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should throw error if paths array is empty', () => {
      const params = { paths: [] };
      expect(() => tool.build(params)).toThrow(
        'params/paths must NOT have fewer than 1 items',
      );
    });

    it('should return an invocation for valid exclude and include patterns', () => {
      const params = {
        paths: ['src/**/*.ts'],
        exclude: ['**/*.test.ts'],
        include: ['src/utils/*.ts'],
      };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
    });

    it('should throw error if paths array contains an empty string', () => {
      const params = { paths: ['file1.txt', ''] };
      expect(() => tool.build(params)).toThrow(
        'params/paths/1 must NOT have fewer than 1 characters',
      );
    });

    it('should throw error if include array contains non-string elements', () => {
      const params = {
        paths: ['file1.txt'],
        include: ['*.ts', 123] as string[],
      };
      expect(() => tool.build(params)).toThrow(
        'params/include/1 must be string',
      );
    });

    it('should throw error if exclude array contains non-string elements', () => {
      const params = {
        paths: ['file1.txt'],
        exclude: ['*.log', {}] as string[],
      };
      expect(() => tool.build(params)).toThrow(
        'params/exclude/1 must be string',
      );
    });
  });

  describe('execute', () => {
    const createFile = (filePath: string, content = '') => {
      const fullPath = path.join(tempRootDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    };
    const createBinaryFile = (filePath: string, data: Uint8Array) => {
      const fullPath = path.join(tempRootDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, data);
    };

    it('should read a single specified file', async () => {
      createFile('file1.txt', 'Content of file1');
      const params = { paths: ['file1.txt'] };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      const expectedPath = path.join(tempRootDir, 'file1.txt');
      expect(result.llmContent).toEqual([
        `--- ${expectedPath} ---\n\nContent of file1\n\n`,
      ]);
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **1 file(s)**',
      );
    });

    it('should read multiple specified files', async () => {
      createFile('file1.txt', 'Content1');
      createFile('subdir/file2.js', 'Content2');
      const params = { paths: ['file1.txt', 'subdir/file2.js'] };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath1 = path.join(tempRootDir, 'file1.txt');
      const expectedPath2 = path.join(tempRootDir, 'subdir/file2.js');
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath1} ---\n\nContent1\n\n`),
        ),
      ).toBe(true);
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath2} ---\n\nContent2\n\n`),
        ),
      ).toBe(true);
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **2 file(s)**',
      );
    });

    it('should handle glob patterns', async () => {
      createFile('file.txt', 'Text file');
      createFile('another.txt', 'Another text');
      createFile('sub/data.json', '{}');
      const params = { paths: ['*.txt'] };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath1 = path.join(tempRootDir, 'file.txt');
      const expectedPath2 = path.join(tempRootDir, 'another.txt');
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath1} ---\n\nText file\n\n`),
        ),
      ).toBe(true);
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath2} ---\n\nAnother text\n\n`),
        ),
      ).toBe(true);
      expect(content.find((c) => c.includes('sub/data.json'))).toBeUndefined();
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **2 file(s)**',
      );
    });

    it('should respect exclude patterns', async () => {
      createFile('src/main.ts', 'Main content');
      createFile('src/main.test.ts', 'Test content');
      const params = { paths: ['src/**/*.ts'], exclude: ['**/*.test.ts'] };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath = path.join(tempRootDir, 'src/main.ts');
      expect(content).toEqual([`--- ${expectedPath} ---\n\nMain content\n\n`]);
      expect(
        content.find((c) => c.includes('src/main.test.ts')),
      ).toBeUndefined();
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **1 file(s)**',
      );
    });

    it('should handle nonexistent specific files gracefully', async () => {
      const params = { paths: ['nonexistent-file.txt'] };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toEqual([
        'No files matching the criteria were found or all were skipped.',
      ]);
      expect(result.returnDisplay).toContain(
        'No files were read and concatenated based on the criteria.',
      );
    });

    it('should use default excludes', async () => {
      createFile('node_modules/some-lib/index.js', 'lib code');
      createFile('src/app.js', 'app code');
      const params = { paths: ['**/*.js'] };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath = path.join(tempRootDir, 'src/app.js');
      expect(content).toEqual([`--- ${expectedPath} ---\n\napp code\n\n`]);
      expect(
        content.find((c) => c.includes('node_modules/some-lib/index.js')),
      ).toBeUndefined();
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **1 file(s)**',
      );
    });

    it('should NOT use default excludes if useDefaultExcludes is false', async () => {
      createFile('node_modules/some-lib/index.js', 'lib code');
      createFile('src/app.js', 'app code');
      const params = { paths: ['**/*.js'], useDefaultExcludes: false };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath1 = path.join(
        tempRootDir,
        'node_modules/some-lib/index.js',
      );
      const expectedPath2 = path.join(tempRootDir, 'src/app.js');
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath1} ---\n\nlib code\n\n`),
        ),
      ).toBe(true);
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath2} ---\n\napp code\n\n`),
        ),
      ).toBe(true);
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **2 file(s)**',
      );
    });

    it('should include images as inlineData parts if explicitly requested by extension', async () => {
      createBinaryFile(
        'image.png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const params = { paths: ['*.png'] }; // Explicitly requesting .png
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            ]).toString('base64'),
            mimeType: 'image/png',
          },
        },
      ]);
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **1 file(s)**',
      );
    });

    it('should include images as inlineData parts if explicitly requested by name', async () => {
      createBinaryFile(
        'myExactImage.png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const params = { paths: ['myExactImage.png'] }; // Explicitly requesting by full name
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from([
              0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
            ]).toString('base64'),
            mimeType: 'image/png',
          },
        },
      ]);
    });

    it('should skip PDF files if not explicitly requested by extension or name', async () => {
      createBinaryFile('document.pdf', Buffer.from('%PDF-1.4...'));
      createFile('notes.txt', 'text notes');
      const params = { paths: ['*'] }; // Generic glob, not specific to .pdf
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      const content = result.llmContent as string[];
      const expectedPath = path.join(tempRootDir, 'notes.txt');
      expect(
        content.some(
          (c) =>
            typeof c === 'string' &&
            c.includes(`--- ${expectedPath} ---\n\ntext notes\n\n`),
        ),
      ).toBe(true);
      expect(result.returnDisplay).toContain('**Skipped 1 item(s):**');
      expect(result.returnDisplay).toContain(
        '- `document.pdf` (Reason: asset file (image/pdf) was not explicitly requested by name or extension)',
      );
    });

    it('should include PDF files as inlineData parts if explicitly requested by extension', async () => {
      createBinaryFile('important.pdf', Buffer.from('%PDF-1.4...'));
      const params = { paths: ['*.pdf'] }; // Explicitly requesting .pdf files
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from('%PDF-1.4...').toString('base64'),
            mimeType: 'application/pdf',
          },
        },
      ]);
    });

    it('should include PDF files as inlineData parts if explicitly requested by name', async () => {
      createBinaryFile('report-final.pdf', Buffer.from('%PDF-1.4...'));
      const params = { paths: ['report-final.pdf'] };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toEqual([
        {
          inlineData: {
            data: Buffer.from('%PDF-1.4...').toString('base64'),
            mimeType: 'application/pdf',
          },
        },
      ]);
    });

    it('should return error if path is ignored by a .geminiignore pattern', async () => {
      createFile('foo.bar', '');
      createFile('bar.ts', '');
      createFile('foo.quux', '');
      const params = { paths: ['foo.bar', 'bar.ts', 'foo.quux'] };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      expect(result.returnDisplay).not.toContain('foo.bar');
      expect(result.returnDisplay).not.toContain('foo.quux');
      expect(result.returnDisplay).toContain('bar.ts');
    });

    it('should read files from multiple workspace directories', async () => {
      const tempDir1 = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'multi-dir-1-')),
      );
      const tempDir2 = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'multi-dir-2-')),
      );
      const fileService = new FileDiscoveryService(tempDir1);
      const mockConfig = {
        getFileService: () => fileService,
        getFileFilteringOptions: () => ({
          respectGitIgnore: true,
          respectGeminiIgnore: true,
        }),
        getWorkspaceContext: () => new WorkspaceContext(tempDir1, [tempDir2]),
        getTargetDir: () => tempDir1,
      } as Partial<Config> as Config;
      tool = new ReadManyFilesTool(mockConfig);

      fs.writeFileSync(path.join(tempDir1, 'file1.txt'), 'Content1');
      fs.writeFileSync(path.join(tempDir2, 'file2.txt'), 'Content2');

      const params = { paths: ['*.txt'] };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      const content = result.llmContent as string[];
      if (!Array.isArray(content)) {
        throw new Error(`llmContent is not an array: ${content}`);
      }
      const expectedPath1 = path.join(tempDir1, 'file1.txt');
      const expectedPath2 = path.join(tempDir2, 'file2.txt');

      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath1} ---\n\nContent1\n\n`),
        ),
      ).toBe(true);
      expect(
        content.some((c) =>
          c.includes(`--- ${expectedPath2} ---\n\nContent2\n\n`),
        ),
      ).toBe(true);
      expect(result.returnDisplay).toContain(
        'Successfully read and concatenated content from **2 file(s)**',
      );

      fs.rmSync(tempDir1, { recursive: true, force: true });
      fs.rmSync(tempDir2, { recursive: true, force: true });
    });

    it('should add a warning for truncated files', async () => {
      createFile('file1.txt', 'Content1');
      // Create a file that will be "truncated" by making it long
      const longContent = Array.from({ length: 2500 }, (_, i) => `L${i}`).join(
        '\n',
      );
      createFile('large-file.txt', longContent);

      const params = { paths: ['*.txt'] };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      const content = result.llmContent as string[];

      const normalFileContent = content.find((c) => c.includes('file1.txt'));
      const truncatedFileContent = content.find((c) =>
        c.includes('large-file.txt'),
      );

      expect(normalFileContent).not.toContain(
        '[WARNING: This file was truncated.',
      );
      expect(truncatedFileContent).toContain(
        "[WARNING: This file was truncated. To view the full content, use the 'read_file' tool on this specific file.]",
      );
      // Check that the actual content is still there but truncated
      expect(truncatedFileContent).toContain('L200');
      expect(truncatedFileContent).not.toContain('L2400');
    });
  });

  describe('Batch Processing', () => {
    const createMultipleFiles = (count: number, contentPrefix = 'Content') => {
      const files: string[] = [];
      for (let i = 0; i < count; i++) {
        const fileName = `file${i}.txt`;
        createFile(fileName, `${contentPrefix} ${i}`);
        files.push(fileName);
      }
      return files;
    };

    const createFile = (filePath: string, content = '') => {
      const fullPath = path.join(tempRootDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    };

    it('should process files in parallel', async () => {
      // Mock detectFileType to add artificial delay to simulate I/O
      const detectFileTypeSpy = vi.spyOn(
        await import('../utils/fileUtils.js'),
        'detectFileType',
      );

      // Create files
      const fileCount = 4;
      const files = createMultipleFiles(fileCount, 'Batch test');

      // Mock with 10ms delay per file to simulate I/O operations
      detectFileTypeSpy.mockImplementation(async (_filePath: string) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'text';
      });

      const params = { paths: files };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      // Verify all files were processed
      const content = result.llmContent as string[];
      expect(content).toHaveLength(fileCount);
      for (let i = 0; i < fileCount; i++) {
        expect(content.join('')).toContain(`Batch test ${i}`);
      }

      // Cleanup mock
      detectFileTypeSpy.mockRestore();
    });

    it('should handle batch processing errors gracefully', async () => {
      // Create mix of valid and problematic files
      createFile('valid1.txt', 'Valid content 1');
      createFile('valid2.txt', 'Valid content 2');
      createFile('valid3.txt', 'Valid content 3');

      const params = {
        paths: [
          'valid1.txt',
          'valid2.txt',
          'nonexistent-file.txt', // This will fail
          'valid3.txt',
        ],
      };

      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);
      const content = result.llmContent as string[];

      // Should successfully process valid files despite one failure
      expect(content.length).toBeGreaterThanOrEqual(3);
      expect(result.returnDisplay).toContain('Successfully read');

      // Verify valid files were processed
      const expectedPath1 = path.join(tempRootDir, 'valid1.txt');
      const expectedPath3 = path.join(tempRootDir, 'valid3.txt');
      expect(content.some((c) => c.includes(expectedPath1))).toBe(true);
      expect(content.some((c) => c.includes(expectedPath3))).toBe(true);
    });

    it('should execute file operations concurrently', async () => {
      // Track execution order to verify concurrency
      const executionOrder: string[] = [];
      const detectFileTypeSpy = vi.spyOn(
        await import('../utils/fileUtils.js'),
        'detectFileType',
      );

      const files = ['file1.txt', 'file2.txt', 'file3.txt'];
      files.forEach((file) => createFile(file, 'test content'));

      // Mock to track concurrent vs sequential execution
      detectFileTypeSpy.mockImplementation(async (filePath: string) => {
        const fileName = filePath.split('/').pop() || '';
        executionOrder.push(`start:${fileName}`);

        // Add delay to make timing differences visible
        await new Promise((resolve) => setTimeout(resolve, 50));

        executionOrder.push(`end:${fileName}`);
        return 'text';
      });

      const invocation = tool.build({ paths: files });
      await invocation.execute(new AbortController().signal);

      console.log('Execution order:', executionOrder);

      // Verify concurrent execution pattern
      // In parallel execution: all "start:" events should come before all "end:" events
      // In sequential execution: "start:file1", "end:file1", "start:file2", "end:file2", etc.

      const startEvents = executionOrder.filter((e) =>
        e.startsWith('start:'),
      ).length;
      const firstEndIndex = executionOrder.findIndex((e) =>
        e.startsWith('end:'),
      );
      const startsBeforeFirstEnd = executionOrder
        .slice(0, firstEndIndex)
        .filter((e) => e.startsWith('start:')).length;

      // For parallel processing, ALL start events should happen before the first end event
      expect(startsBeforeFirstEnd).toBe(startEvents); // Should PASS with parallel implementation

      detectFileTypeSpy.mockRestore();
    });
  });
});
