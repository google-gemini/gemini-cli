/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  // afterEach, // Removed unused import
  Mocked,
} from 'vitest';
import * as fsPromises from 'fs/promises';
import * as fsSync from 'fs'; // For constants
import { Stats, Dirent } from 'fs'; // Import types directly from 'fs'
import * as os from 'os';
import * as path from 'path';
import { loadServerHierarchicalMemory } from './memoryDiscovery.js';
import { GEMINI_CONFIG_DIR, GEMINI_MD_FILENAME } from '../tools/memoryTool.js';

// Mock the entire fs/promises module
vi.mock('fs/promises');
// Mock the parts of fsSync we might use (like constants or existsSync if needed)
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fsSync>();
  return {
    ...actual, // Spread actual to get all exports, including Stats and Dirent if they are classes/constructors
    constants: { ...actual.constants }, // Preserve constants
    // Mock other fsSync functions if directly used by memoryDiscovery, e.g., existsSync
    // existsSync: vi.fn(),
  };
});
vi.mock('os');

describe('loadServerHierarchicalMemory', () => {
  const mockFs = fsPromises as Mocked<typeof fsPromises>;
  const mockOs = os as Mocked<typeof os>;

  const CWD = '/test/project/src';
  const PROJECT_ROOT = '/test/project';
  const USER_HOME = '/test/userhome';
  const GLOBAL_GEMINI_DIR = path.join(USER_HOME, GEMINI_CONFIG_DIR);
  const GLOBAL_GEMINI_FILE = path.join(GLOBAL_GEMINI_DIR, GEMINI_MD_FILENAME);

  beforeEach(() => {
    vi.resetAllMocks();

    mockOs.homedir.mockReturnValue(USER_HOME);
    mockFs.stat.mockRejectedValue(new Error('File not found'));
    mockFs.readdir.mockResolvedValue([]);
    mockFs.readFile.mockRejectedValue(new Error('File not found'));
    mockFs.access.mockRejectedValue(new Error('File not found'));
  });

  it('should return empty memory and count if no GEMINI.md files are found', async () => {
    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
    );
    expect(memoryContent).toBe('');
    expect(fileCount).toBe(0);
  });

  it('should load only the global GEMINI.md if present and others are not', async () => {
    mockFs.access.mockImplementation(async (p) => {
      if (p === GLOBAL_GEMINI_FILE) {
        return undefined;
      }
      throw new Error('File not found');
    });
    mockFs.readFile.mockImplementation(async (p) => {
      if (p === GLOBAL_GEMINI_FILE) {
        return 'Global memory content';
      }
      throw new Error('File not found');
    });

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
    );

    expect(memoryContent).toBe(
      `--- Context from: ${path.relative(CWD, GLOBAL_GEMINI_FILE)} ---\nGlobal memory content\n--- End of Context from: ${path.relative(CWD, GLOBAL_GEMINI_FILE)} ---`,
    );
    expect(fileCount).toBe(1);
    expect(mockFs.readFile).toHaveBeenCalledWith(GLOBAL_GEMINI_FILE, 'utf-8');
  });

  it('should load GEMINI.md files by upward traversal from CWD to project root', async () => {
    const projectRootGeminiFile = path.join(PROJECT_ROOT, GEMINI_MD_FILENAME);
    const srcGeminiFile = path.join(CWD, GEMINI_MD_FILENAME);

    mockFs.stat.mockImplementation(async (p) => {
      if (p === path.join(PROJECT_ROOT, '.git')) {
        return { isDirectory: () => true } as Stats;
      }
      throw new Error('File not found');
    });

    mockFs.access.mockImplementation(async (p) => {
      if (p === projectRootGeminiFile || p === srcGeminiFile) {
        return undefined;
      }
      throw new Error('File not found');
    });

    mockFs.readFile.mockImplementation(async (p) => {
      if (p === projectRootGeminiFile) {
        return 'Project root memory';
      }
      if (p === srcGeminiFile) {
        return 'Src directory memory';
      }
      throw new Error('File not found');
    });

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
    );
    const expectedContent =
      `--- Context from: ${path.relative(CWD, projectRootGeminiFile)} ---\nProject root memory\n--- End of Context from: ${path.relative(CWD, projectRootGeminiFile)} ---\n\n` +
      `--- Context from: ${GEMINI_MD_FILENAME} ---\nSrc directory memory\n--- End of Context from: ${GEMINI_MD_FILENAME} ---`;

    expect(memoryContent).toBe(expectedContent);
    expect(fileCount).toBe(2);
    expect(mockFs.readFile).toHaveBeenCalledWith(
      projectRootGeminiFile,
      'utf-8',
    );
    expect(mockFs.readFile).toHaveBeenCalledWith(srcGeminiFile, 'utf-8');
  });

  it('should load GEMINI.md files by downward traversal from CWD', async () => {
    const subDir = path.join(CWD, 'subdir');
    const subDirGeminiFile = path.join(subDir, GEMINI_MD_FILENAME);
    const cwdGeminiFile = path.join(CWD, GEMINI_MD_FILENAME);

    mockFs.access.mockImplementation(async (p) => {
      if (p === cwdGeminiFile || p === subDirGeminiFile) return undefined;
      throw new Error('File not found');
    });

    mockFs.readFile.mockImplementation(async (p) => {
      if (p === cwdGeminiFile) return 'CWD memory';
      if (p === subDirGeminiFile) return 'Subdir memory';
      throw new Error('File not found');
    });

    mockFs.readdir.mockImplementation((async (
      p: fsSync.PathLike,
    ): Promise<Dirent[]> => {
      if (p === CWD) {
        return [
          {
            name: GEMINI_MD_FILENAME,
            isFile: () => true,
            isDirectory: () => false,
          },
          { name: 'subdir', isFile: () => false, isDirectory: () => true },
        ] as Dirent[];
      }
      if (p === subDir) {
        return [
          {
            name: GEMINI_MD_FILENAME,
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as Dirent[];
      }
      return [] as Dirent[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
    );
    const expectedContent =
      `--- Context from: ${GEMINI_MD_FILENAME} ---\nCWD memory\n--- End of Context from: ${GEMINI_MD_FILENAME} ---\n\n` +
      `--- Context from: ${path.join('subdir', GEMINI_MD_FILENAME)} ---\nSubdir memory\n--- End of Context from: ${path.join('subdir', GEMINI_MD_FILENAME)} ---`;

    expect(memoryContent).toBe(expectedContent);
    expect(fileCount).toBe(2);
  });

  it('should load and correctly order global, upward, and downward GEMINI.md files', async () => {
    const projectParentDir = path.dirname(PROJECT_ROOT);
    const projectParentGeminiFile = path.join(
      projectParentDir,
      GEMINI_MD_FILENAME,
    );
    const projectRootGeminiFile = path.join(PROJECT_ROOT, GEMINI_MD_FILENAME);
    const cwdGeminiFile = path.join(CWD, GEMINI_MD_FILENAME);
    const subDir = path.join(CWD, 'sub');
    const subDirGeminiFile = path.join(subDir, GEMINI_MD_FILENAME);

    mockFs.stat.mockImplementation(async (p) => {
      if (p === path.join(PROJECT_ROOT, '.git')) {
        return { isDirectory: () => true } as Stats;
      }
      throw new Error('File not found');
    });

    mockFs.access.mockImplementation(async (p) => {
      if (
        p === GLOBAL_GEMINI_FILE ||
        p === projectParentGeminiFile ||
        p === projectRootGeminiFile ||
        p === cwdGeminiFile ||
        p === subDirGeminiFile
      ) {
        return undefined;
      }
      throw new Error('File not found');
    });

    mockFs.readFile.mockImplementation(async (p) => {
      if (p === GLOBAL_GEMINI_FILE) return 'Global memory';
      if (p === projectParentGeminiFile) return 'Project parent memory';
      if (p === projectRootGeminiFile) return 'Project root memory';
      if (p === cwdGeminiFile) return 'CWD memory';
      if (p === subDirGeminiFile) return 'Subdir memory';
      throw new Error('File not found');
    });

    mockFs.readdir.mockImplementation((async (
      p: fsSync.PathLike,
    ): Promise<Dirent[]> => {
      if (p === CWD) {
        return [
          { name: 'sub', isFile: () => false, isDirectory: () => true },
        ] as Dirent[];
      }
      if (p === subDir) {
        return [
          {
            name: GEMINI_MD_FILENAME,
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as Dirent[];
      }
      return [] as Dirent[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
    );

    const relPathGlobal = path.relative(CWD, GLOBAL_GEMINI_FILE);
    const relPathProjectParent = path.relative(CWD, projectParentGeminiFile);
    const relPathProjectRoot = path.relative(CWD, projectRootGeminiFile);
    const relPathCwd = GEMINI_MD_FILENAME;
    const relPathSubDir = path.join('sub', GEMINI_MD_FILENAME);

    const expectedContent = [
      `--- Context from: ${relPathGlobal} ---\nGlobal memory\n--- End of Context from: ${relPathGlobal} ---`,
      `--- Context from: ${relPathProjectParent} ---\nProject parent memory\n--- End of Context from: ${relPathProjectParent} ---`,
      `--- Context from: ${relPathProjectRoot} ---\nProject root memory\n--- End of Context from: ${relPathProjectRoot} ---`,
      `--- Context from: ${relPathCwd} ---\nCWD memory\n--- End of Context from: ${relPathCwd} ---`,
      `--- Context from: ${relPathSubDir} ---\nSubdir memory\n--- End of Context from: ${relPathSubDir} ---`,
    ].join('\n\n');

    expect(memoryContent).toBe(expectedContent);
    expect(fileCount).toBe(5);
  });

  it('should ignore specified directories during downward scan', async () => {
    const ignoredDir = path.join(CWD, 'node_modules');
    const ignoredDirGeminiFile = path.join(ignoredDir, GEMINI_MD_FILENAME);
    const regularSubDir = path.join(CWD, 'my_code');
    const regularSubDirGeminiFile = path.join(
      regularSubDir,
      GEMINI_MD_FILENAME,
    );

    mockFs.access.mockImplementation(async (p) => {
      if (p === regularSubDirGeminiFile) return undefined;
      if (p === ignoredDirGeminiFile)
        throw new Error('Should not access ignored file');
      throw new Error('File not found');
    });

    mockFs.readFile.mockImplementation(async (p) => {
      if (p === regularSubDirGeminiFile) return 'My code memory';
      throw new Error('File not found');
    });

    mockFs.readdir.mockImplementation((async (
      p: fsSync.PathLike,
    ): Promise<Dirent[]> => {
      if (p === CWD) {
        return [
          {
            name: 'node_modules',
            isFile: () => false,
            isDirectory: () => true,
          },
          { name: 'my_code', isFile: () => false, isDirectory: () => true },
        ] as Dirent[];
      }
      if (p === regularSubDir) {
        return [
          {
            name: GEMINI_MD_FILENAME,
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as Dirent[];
      }
      if (p === ignoredDir) {
        return [
          {
            name: GEMINI_MD_FILENAME,
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as Dirent[];
      }
      return [] as Dirent[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      CWD,
      false,
    );

    const expectedContent = `--- Context from: ${path.join('my_code', GEMINI_MD_FILENAME)} ---\nMy code memory\n--- End of Context from: ${path.join('my_code', GEMINI_MD_FILENAME)} ---`;

    expect(memoryContent).toBe(expectedContent);
    expect(fileCount).toBe(1);
    expect(mockFs.readFile).not.toHaveBeenCalledWith(
      ignoredDirGeminiFile,
      'utf-8',
    );
  });

  it('should respect MAX_DIRECTORIES_TO_SCAN_FOR_MEMORY during downward scan', async () => {
    const consoleDebugSpy = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => {});

    const dirNames: Dirent[] = [];
    for (let i = 0; i < 250; i++) {
      dirNames.push({
        name: `deep_dir_${i}`,
        isFile: () => false,
        isDirectory: () => true,
      } as Dirent);
    }

    mockFs.readdir.mockImplementation((async (
      p: fsSync.PathLike,
    ): Promise<Dirent[]> => {
      if (p === CWD) return dirNames;
      if (p.toString().startsWith(path.join(CWD, 'deep_dir_')))
        return [] as Dirent[];
      return [] as Dirent[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    mockFs.access.mockRejectedValue(new Error('not found'));

    await loadServerHierarchicalMemory(CWD, true);

    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] [MemoryDiscovery]'),
      expect.stringContaining(
        'Max directory scan limit (200) reached. Stopping downward scan at:',
      ),
    );
    consoleDebugSpy.mockRestore();
  });
});
