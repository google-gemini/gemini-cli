/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import mock from 'mock-fs';
import * as path from 'node:path';
import { WorkspaceContext } from './workspaceContext.js';
import { readPathFromWorkspace } from './pathReader.js';
import type { Config } from '../config/config.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import type { FileDiscoveryService } from '../services/fileDiscoveryService.js';

// --- Helper for creating a mock Config object ---
// We use the actual implementations of WorkspaceContext and FileSystemService
// to test the integration against mock-fs.
const createMockConfig = (
  cwd: string,
  otherDirs: string[] = [],
  mockFileService?: FileDiscoveryService,
): Config => {
  const workspace = new WorkspaceContext(cwd, otherDirs);
  const fileSystemService = new StandardFileSystemService();
  return {
    getWorkspaceContext: () => workspace,
    // TargetDir is used by processSingleFileContent to generate relative paths in errors/output
    getTargetDir: () => cwd,
    getFileSystemService: () => fileSystemService,
    getFileService: () => mockFileService,
  } as unknown as Config;
};

describe('readPathFromWorkspace', () => {
  const CWD = path.resolve('/test/cwd');
  const OTHER_DIR = path.resolve('/test/other');
  const OUTSIDE_DIR = path.resolve('/test/outside');

  afterEach(() => {
    mock.restore();
    vi.resetAllMocks();
  });

  it('should read a text file from the CWD', async () => {
    mock({
      [CWD]: {
        'file.txt': 'hello from cwd',
      },
    });
    const mockFileService = {
      filterFiles: vi.fn((files) => files),
    } as unknown as FileDiscoveryService;
    const config = createMockConfig(CWD, [], mockFileService);
    const result = await readPathFromWorkspace('file.txt', config);
    // Expect [string] for text content
    expect(result).toEqual(['hello from cwd']);
    expect(mockFileService.filterFiles).toHaveBeenCalled();
  });

  it('should read a file from a secondary workspace directory', async () => {
    mock({
      [CWD]: {},
      [OTHER_DIR]: {
        'file.txt': 'hello from other dir',
      },
    });
    const mockFileService = {
      filterFiles: vi.fn((files) => files),
    } as unknown as FileDiscoveryService;
    const config = createMockConfig(CWD, [OTHER_DIR], mockFileService);
    const result = await readPathFromWorkspace('file.txt', config);
    expect(result).toEqual(['hello from other dir']);
  });

  it('should prioritize CWD when file exists in both CWD and secondary dir', async () => {
    mock({
      [CWD]: {
        'file.txt': 'hello from cwd',
      },
      [OTHER_DIR]: {
        'file.txt': 'hello from other dir',
      },
    });
    const mockFileService = {
      filterFiles: vi.fn((files) => files),
    } as unknown as FileDiscoveryService;
    const config = createMockConfig(CWD, [OTHER_DIR], mockFileService);
    const result = await readPathFromWorkspace('file.txt', config);
    expect(result).toEqual(['hello from cwd']);
  });

  it('should read an image file and return it as inlineData (Part object)', async () => {
    // Use a real PNG header for robustness
    const imageData = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    mock({
      [CWD]: {
        'image.png': imageData,
      },
    });
    const mockFileService = {
      filterFiles: vi.fn((files) => files),
    } as unknown as FileDiscoveryService;
    const config = createMockConfig(CWD, [], mockFileService);
    const result = await readPathFromWorkspace('image.png', config);
    // Expect [Part] for image content
    expect(result).toEqual([
      {
        inlineData: {
          mimeType: 'image/png',
          data: imageData.toString('base64'),
        },
      },
    ]);
  });

  it('should read a generic binary file and return an info string', async () => {
    // Data that is clearly binary (null bytes)
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    mock({
      [CWD]: {
        'data.bin': binaryData,
      },
    });
    const mockFileService = {
      filterFiles: vi.fn((files) => files),
    } as unknown as FileDiscoveryService;
    const config = createMockConfig(CWD, [], mockFileService);
    const result = await readPathFromWorkspace('data.bin', config);
    // Expect [string] containing the skip message from fileUtils
    expect(result).toEqual(['Cannot display content of binary file: data.bin']);
  });

  it('should read a file from an absolute path if within workspace', async () => {
    const absPath = path.join(OTHER_DIR, 'abs.txt');
    mock({
      [CWD]: {},
      [OTHER_DIR]: {
        'abs.txt': 'absolute content',
      },
    });
    const mockFileService = {
      filterFiles: vi.fn((files) => files),
    } as unknown as FileDiscoveryService;
    const config = createMockConfig(CWD, [OTHER_DIR], mockFileService);
    const result = await readPathFromWorkspace(absPath, config);
    expect(result).toEqual(['absolute content']);
  });

  describe('Directory Expansion', () => {
    it('should expand a directory and read the content of its files', async () => {
      mock({
        [CWD]: {
          'my-dir': {
            'file1.txt': 'content of file 1',
            'file2.md': 'content of file 2',
          },
        },
      });
      const mockFileService = {
        filterFiles: vi.fn((files) => files),
      } as unknown as FileDiscoveryService;
      const config = createMockConfig(CWD, [], mockFileService);
      const result = await readPathFromWorkspace('my-dir', config);

      // Convert to a single string for easier, order-independent checking
      const resultText = result
        .map((p) => {
          if (typeof p === 'string') return p;
          if (typeof p === 'object' && p && 'text' in p) return p.text;
          // This part is important for handling binary/image data which isn't just text
          if (typeof p === 'object' && p && 'inlineData' in p) return '';
          return p;
        })
        .join('');

      expect(resultText).toContain(
        '--- Start of content for directory: my-dir ---',
      );
      expect(resultText).toContain('--- file1.txt ---');
      expect(resultText).toContain('content of file 1');
      expect(resultText).toContain('--- file2.md ---');
      expect(resultText).toContain('content of file 2');
      expect(resultText).toContain(
        '--- End of content for directory: my-dir ---',
      );
    });

    it('should recursively expand a directory and read all nested files', async () => {
      mock({
        [CWD]: {
          'my-dir': {
            'file1.txt': 'content of file 1',
            'sub-dir': {
              'nested.txt': 'nested content',
            },
          },
        },
      });
      const mockFileService = {
        filterFiles: vi.fn((files) => files),
      } as unknown as FileDiscoveryService;
      const config = createMockConfig(CWD, [], mockFileService);
      const result = await readPathFromWorkspace('my-dir', config);

      const resultText = result
        .map((p) => {
          if (typeof p === 'string') return p;
          if (typeof p === 'object' && p && 'text' in p) return p.text;
          return '';
        })
        .join('');

      expect(resultText).toContain('content of file 1');
      expect(resultText).toContain('nested content');
      expect(resultText).toContain(
        `--- ${path.join('sub-dir', 'nested.txt')} ---`,
      );
    });

    it('should handle mixed content and include files from subdirectories', async () => {
      const imageData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      mock({
        [CWD]: {
          'mixed-dir': {
            'info.txt': 'some text',
            'photo.png': imageData,
            'sub-dir': {
              'nested.txt': 'this should be included',
            },
            'empty-sub-dir': {},
          },
        },
      });
      const mockFileService = {
        filterFiles: vi.fn((files) => files),
      } as unknown as FileDiscoveryService;
      const config = createMockConfig(CWD, [], mockFileService);
      const result = await readPathFromWorkspace('mixed-dir', config);

      // Check for the text part
      const textContent = result
        .map((p) => {
          if (typeof p === 'string') return p;
          if (typeof p === 'object' && p && 'text' in p) return p.text;
          return ''; // Ignore non-text parts for this assertion
        })
        .join('');
      expect(textContent).toContain('some text');
      expect(textContent).toContain('this should be included');

      // Check for the image part
      const imagePart = result.find(
        (p) => typeof p === 'object' && 'inlineData' in p,
      );
      expect(imagePart).toEqual({
        inlineData: {
          mimeType: 'image/png',
          data: imageData.toString('base64'),
        },
      });
    });

    it('should handle an empty directory', async () => {
      mock({
        [CWD]: {
          'empty-dir': {},
        },
      });
      const mockFileService = {
        filterFiles: vi.fn((files) => files),
      } as unknown as FileDiscoveryService;
      const config = createMockConfig(CWD, [], mockFileService);
      const result = await readPathFromWorkspace('empty-dir', config);
      expect(result).toEqual([
        { text: '--- Start of content for directory: empty-dir ---\n' },
        { text: '--- End of content for directory: empty-dir ---' },
      ]);
    });
  });

  describe('File Ignoring', () => {
    it('should return an empty array for an ignored file', async () => {
      mock({
        [CWD]: {
          'ignored.txt': 'ignored content',
        },
      });
      const mockFileService = {
        filterFiles: vi.fn(() => []), // Simulate the file being filtered out
      } as unknown as FileDiscoveryService;
      const config = createMockConfig(CWD, [], mockFileService);
      const result = await readPathFromWorkspace('ignored.txt', config);
      expect(result).toEqual([]);
      expect(mockFileService.filterFiles).toHaveBeenCalledWith(
        ['ignored.txt'],
        {
          respectGitIgnore: true,
          respectGeminiIgnore: true,
        },
      );
    });

    it('should not read ignored files when expanding a directory', async () => {
      mock({
        [CWD]: {
          'my-dir': {
            'not-ignored.txt': 'visible',
            'ignored.log': 'invisible',
          },
        },
      });
      const mockFileService = {
        filterFiles: vi.fn((files: string[]) =>
          files.filter((f) => !f.endsWith('ignored.log')),
        ),
      } as unknown as FileDiscoveryService;
      const config = createMockConfig(CWD, [], mockFileService);
      const result = await readPathFromWorkspace('my-dir', config);
      const resultText = result
        .map((p) => {
          if (typeof p === 'string') return p;
          if (typeof p === 'object' && p && 'text' in p) return p.text;
          return '';
        })
        .join('');

      expect(resultText).toContain('visible');
      expect(resultText).not.toContain('invisible');
      expect(mockFileService.filterFiles).toHaveBeenCalled();
    });
  });

  it('should throw an error for an absolute path outside the workspace', async () => {
    const absPath = path.join(OUTSIDE_DIR, 'secret.txt');
    mock({
      [CWD]: {},
      [OUTSIDE_DIR]: {
        'secret.txt': 'secrets',
      },
    });
    // OUTSIDE_DIR is not added to the config's workspace
    const config = createMockConfig(CWD);
    await expect(readPathFromWorkspace(absPath, config)).rejects.toThrow(
      `Absolute path is outside of the allowed workspace: ${absPath}`,
    );
  });

  it('should throw an error if a relative path is not found anywhere', async () => {
    mock({
      [CWD]: {},
      [OTHER_DIR]: {},
    });
    const config = createMockConfig(CWD, [OTHER_DIR]);
    await expect(
      readPathFromWorkspace('not-found.txt', config),
    ).rejects.toThrow('Path not found in workspace: not-found.txt');
  });

  // mock-fs permission simulation is unreliable on Windows.
  it.skipIf(process.platform === 'win32')(
    'should return an error string if reading a file with no permissions',
    async () => {
      mock({
        [CWD]: {
          'unreadable.txt': mock.file({
            content: 'you cannot read me',
            mode: 0o222, // Write-only
          }),
        },
      });
      const mockFileService = {
        filterFiles: vi.fn((files) => files),
      } as unknown as FileDiscoveryService;
      const config = createMockConfig(CWD, [], mockFileService);
      // processSingleFileContent catches the error and returns an error string.
      const result = await readPathFromWorkspace('unreadable.txt', config);
      const textResult = result[0] as string;

      // processSingleFileContent formats errors using the relative path from the target dir (CWD).
      expect(textResult).toContain('Error reading file unreadable.txt');
      expect(textResult).toMatch(/(EACCES|permission denied)/i);
    },
  );

  it('should return an error string for files exceeding the size limit', async () => {
    // Mock a file slightly larger than the 20MB limit defined in fileUtils.ts
    const largeContent = 'a'.repeat(21 * 1024 * 1024); // 21MB
    mock({
      [CWD]: {
        'large.txt': largeContent,
      },
    });
    const mockFileService = {
      filterFiles: vi.fn((files) => files),
    } as unknown as FileDiscoveryService;
    const config = createMockConfig(CWD, [], mockFileService);
    const result = await readPathFromWorkspace('large.txt', config);
    const textResult = result[0] as string;
    // The error message comes directly from processSingleFileContent
    expect(textResult).toBe('File size exceeds the 20MB limit.');
  });
});
