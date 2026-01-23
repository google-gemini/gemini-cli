/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadServerHierarchicalMemory,
  loadGlobalMemory,
  loadEnvironmentMemory,
  loadJitSubdirectoryMemory,
  refreshServerHierarchicalMemory,
} from './memoryDiscovery.js';
import {
  setGeminiMdFilename,
  DEFAULT_CONTEXT_FILENAME,
} from '../tools/memoryTool.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GEMINI_DIR } from './paths.js';
import { Config, type GeminiCLIExtension } from '../config/config.js';
import { Storage } from '../config/storage.js';
import { SimpleExtensionLoader } from './extensionLoader.js';
import { CoreEvent, coreEvents } from './events.js';
import { debugLogger } from './debugLogger.js';

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(),
  };
});

vi.mock('../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths.js')>();
  return {
    ...actual,
    homedir: vi.fn(),
  };
});

import { homedir as pathsHomedir } from './paths.js';

describe('memoryDiscovery', () => {
  const DEFAULT_FOLDER_TRUST = true;
  let testRootDir: string;
  let cwd: string;
  let projectRoot: string;
  let homedir: string;

  async function createEmptyDir(fullPath: string) {
    await fsPromises.mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  async function createTestFile(fullPath: string, fileContents: string) {
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, fileContents);
    return path.resolve(testRootDir, fullPath);
  }

  beforeEach(async () => {
    testRootDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'folder-structure-test-'),
    );

    vi.resetAllMocks();
    // Set environment variables to indicate test environment
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VITEST', 'true');

    projectRoot = await createEmptyDir(path.join(testRootDir, 'project'));
    cwd = await createEmptyDir(path.join(projectRoot, 'src'));
    homedir = await createEmptyDir(path.join(testRootDir, 'userhome'));
    vi.mocked(os.homedir).mockReturnValue(homedir);
    vi.mocked(pathsHomedir).mockReturnValue(homedir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    // Some tests set this to a different value.
    setGeminiMdFilename(DEFAULT_CONTEXT_FILENAME);
    // Clean up the temporary directory to prevent resource leaks.
    // Use maxRetries option for robust cleanup without race conditions
    await fsPromises.rm(testRootDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 10,
    });
  });

  describe('when untrusted', () => {
    it('does not load context files from untrusted workspaces', async () => {
      await createTestFile(
        path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
        'Project root memory',
      );
      await createTestFile(
        path.join(cwd, DEFAULT_CONTEXT_FILENAME),
        'Src directory memory',
      );
      const result = await loadServerHierarchicalMemory(
        cwd,
        [],
        false,
        new FileDiscoveryService(projectRoot),
        new SimpleExtensionLoader([]),
        false, // untrusted
      );

      expect(result).toEqual({
        memoryContent: '',
        fileCount: 0,
        filePaths: [],
      });
    });

    it('loads context from outside the untrusted workspace', async () => {
      await createTestFile(
        path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
        'Project root memory', // Untrusted
      );
      await createTestFile(
        path.join(cwd, DEFAULT_CONTEXT_FILENAME),
        'Src directory memory', // Untrusted
      );

      const filepath = path.join(homedir, GEMINI_DIR, DEFAULT_CONTEXT_FILENAME);
      await createTestFile(filepath, 'default context content'); // In user home dir (outside untrusted space).
      const { fileCount, memoryContent, filePaths } =
        await loadServerHierarchicalMemory(
          cwd,
          [],
          false,
          new FileDiscoveryService(projectRoot),
          new SimpleExtensionLoader([]),
          false, // untrusted
        );

      expect(fileCount).toEqual(1);
      expect(memoryContent).toContain(path.relative(cwd, filepath).toString());
      expect(filePaths).toEqual([filepath]);
    });
  });

  it('should return empty memory and count if no context files are found', async () => {
    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: '',
      fileCount: 0,
      filePaths: [],
    });
  });

  it('should load only the global context file if present and others are not (default filename)', async () => {
    const defaultContextFile = await createTestFile(
      path.join(homedir, GEMINI_DIR, DEFAULT_CONTEXT_FILENAME),
      'default context content',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, defaultContextFile)} ---
default context content
--- End of Context from: ${path.relative(cwd, defaultContextFile)} ---`,
      fileCount: 1,
      filePaths: [defaultContextFile],
    });
  });

  it('should load only the global custom context file if present and filename is changed', async () => {
    const customFilename = 'CUSTOM_AGENTS.md';
    setGeminiMdFilename(customFilename);

    const customContextFile = await createTestFile(
      path.join(homedir, GEMINI_DIR, customFilename),
      'custom context content',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, customContextFile)} ---
custom context content
--- End of Context from: ${path.relative(cwd, customContextFile)} ---`,
      fileCount: 1,
      filePaths: [customContextFile],
    });
  });

  it('should load context files by upward traversal with custom filename', async () => {
    const customFilename = 'PROJECT_CONTEXT.md';
    setGeminiMdFilename(customFilename);

    const projectContextFile = await createTestFile(
      path.join(projectRoot, customFilename),
      'project context content',
    );
    const cwdContextFile = await createTestFile(
      path.join(cwd, customFilename),
      'cwd context content',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, projectContextFile)} ---
project context content
--- End of Context from: ${path.relative(cwd, projectContextFile)} ---

--- Context from: ${path.relative(cwd, cwdContextFile)} ---
cwd context content
--- End of Context from: ${path.relative(cwd, cwdContextFile)} ---`,
      fileCount: 2,
      filePaths: [projectContextFile, cwdContextFile],
    });
  });

  it('should load context files by downward traversal with custom filename', async () => {
    const customFilename = 'LOCAL_CONTEXT.md';
    setGeminiMdFilename(customFilename);

    const subdirCustomFile = await createTestFile(
      path.join(cwd, 'subdir', customFilename),
      'Subdir custom memory',
    );
    const cwdCustomFile = await createTestFile(
      path.join(cwd, customFilename),
      'CWD custom memory',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${customFilename} ---
CWD custom memory
--- End of Context from: ${customFilename} ---

--- Context from: ${path.join('subdir', customFilename)} ---
Subdir custom memory
--- End of Context from: ${path.join('subdir', customFilename)} ---`,
      fileCount: 2,
      filePaths: [cwdCustomFile, subdirCustomFile],
    });
  });

  it('should load ORIGINAL_GEMINI_MD_FILENAME files by upward traversal from CWD to project root', async () => {
    const projectRootGeminiFile = await createTestFile(
      path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      'Project root memory',
    );
    const srcGeminiFile = await createTestFile(
      path.join(cwd, DEFAULT_CONTEXT_FILENAME),
      'Src directory memory',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, projectRootGeminiFile)} ---
Project root memory
--- End of Context from: ${path.relative(cwd, projectRootGeminiFile)} ---

--- Context from: ${path.relative(cwd, srcGeminiFile)} ---
Src directory memory
--- End of Context from: ${path.relative(cwd, srcGeminiFile)} ---`,
      fileCount: 2,
      filePaths: [projectRootGeminiFile, srcGeminiFile],
    });
  });

  it('should load ORIGINAL_GEMINI_MD_FILENAME files by downward traversal from CWD', async () => {
    const subDirGeminiFile = await createTestFile(
      path.join(cwd, 'subdir', DEFAULT_CONTEXT_FILENAME),
      'Subdir memory',
    );
    const cwdGeminiFile = await createTestFile(
      path.join(cwd, DEFAULT_CONTEXT_FILENAME),
      'CWD memory',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${DEFAULT_CONTEXT_FILENAME} ---
CWD memory
--- End of Context from: ${DEFAULT_CONTEXT_FILENAME} ---

--- Context from: ${path.join('subdir', DEFAULT_CONTEXT_FILENAME)} ---
Subdir memory
--- End of Context from: ${path.join('subdir', DEFAULT_CONTEXT_FILENAME)} ---`,
      fileCount: 2,
      filePaths: [cwdGeminiFile, subDirGeminiFile],
    });
  });

  it('should load and correctly order global, upward, and downward ORIGINAL_GEMINI_MD_FILENAME files', async () => {
    const defaultContextFile = await createTestFile(
      path.join(homedir, GEMINI_DIR, DEFAULT_CONTEXT_FILENAME),
      'default context content',
    );
    const rootGeminiFile = await createTestFile(
      path.join(testRootDir, DEFAULT_CONTEXT_FILENAME),
      'Project parent memory',
    );
    const projectRootGeminiFile = await createTestFile(
      path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      'Project root memory',
    );
    const cwdGeminiFile = await createTestFile(
      path.join(cwd, DEFAULT_CONTEXT_FILENAME),
      'CWD memory',
    );
    const subDirGeminiFile = await createTestFile(
      path.join(cwd, 'sub', DEFAULT_CONTEXT_FILENAME),
      'Subdir memory',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, defaultContextFile)} ---
default context content
--- End of Context from: ${path.relative(cwd, defaultContextFile)} ---

--- Context from: ${path.relative(cwd, rootGeminiFile)} ---
Project parent memory
--- End of Context from: ${path.relative(cwd, rootGeminiFile)} ---

--- Context from: ${path.relative(cwd, projectRootGeminiFile)} ---
Project root memory
--- End of Context from: ${path.relative(cwd, projectRootGeminiFile)} ---

--- Context from: ${path.relative(cwd, cwdGeminiFile)} ---
CWD memory
--- End of Context from: ${path.relative(cwd, cwdGeminiFile)} ---

--- Context from: ${path.relative(cwd, subDirGeminiFile)} ---
Subdir memory
--- End of Context from: ${path.relative(cwd, subDirGeminiFile)} ---`,
      fileCount: 5,
      filePaths: [
        defaultContextFile,
        rootGeminiFile,
        projectRootGeminiFile,
        cwdGeminiFile,
        subDirGeminiFile,
      ],
    });
  });

  it('should ignore specified directories during downward scan', async () => {
    await createEmptyDir(path.join(projectRoot, '.git'));
    await createTestFile(path.join(projectRoot, '.gitignore'), 'node_modules');

    await createTestFile(
      path.join(cwd, 'node_modules', DEFAULT_CONTEXT_FILENAME),
      'Ignored memory',
    );
    const regularSubDirGeminiFile = await createTestFile(
      path.join(cwd, 'my_code', DEFAULT_CONTEXT_FILENAME),
      'My code memory',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
      'tree',
      {
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      },
      200, // maxDirs parameter
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, regularSubDirGeminiFile)} ---
My code memory
--- End of Context from: ${path.relative(cwd, regularSubDirGeminiFile)} ---`,
      fileCount: 1,
      filePaths: [regularSubDirGeminiFile],
    });
  });

  it('should respect the maxDirs parameter during downward scan', async () => {
    const consoleDebugSpy = vi
      .spyOn(debugLogger, 'debug')
      .mockImplementation(() => {});

    // Create directories in parallel for better performance
    const dirPromises = Array.from({ length: 2 }, (_, i) =>
      createEmptyDir(path.join(cwd, `deep_dir_${i}`)),
    );
    await Promise.all(dirPromises);

    // Pass the custom limit directly to the function
    await loadServerHierarchicalMemory(
      cwd,
      [],
      true,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
      'tree', // importFormat
      {
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      },
      1, // maxDirs
    );

    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] [BfsFileSearch]'),
      expect.stringContaining('Scanning [1/1]:'),
    );

    consoleDebugSpy.mockRestore();

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: '',
      fileCount: 0,
      filePaths: [],
    });
  });

  it('should load extension context file paths', async () => {
    const extensionFilePath = await createTestFile(
      path.join(testRootDir, 'extensions/ext1/GEMINI.md'),
      'Extension memory content',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([
        {
          contextFiles: [extensionFilePath],
          isActive: true,
        } as GeminiCLIExtension,
      ]),
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, extensionFilePath)} ---
Extension memory content
--- End of Context from: ${path.relative(cwd, extensionFilePath)} ---`,
      fileCount: 1,
      filePaths: [extensionFilePath],
    });
  });

  it('should load memory from included directories', async () => {
    const includedDir = await createEmptyDir(
      path.join(testRootDir, 'included'),
    );
    const includedFile = await createTestFile(
      path.join(includedDir, DEFAULT_CONTEXT_FILENAME),
      'included directory memory',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [includedDir],
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, includedFile)} ---
included directory memory
--- End of Context from: ${path.relative(cwd, includedFile)} ---`,
      fileCount: 1,
      filePaths: [includedFile],
    });
  });

  it('should handle multiple directories and files in parallel correctly', async () => {
    // Create multiple test directories with GEMINI.md files
    const numDirs = 5;
    const createdFiles: string[] = [];

    for (let i = 0; i < numDirs; i++) {
      const dirPath = await createEmptyDir(
        path.join(testRootDir, `project-${i}`),
      );
      const filePath = await createTestFile(
        path.join(dirPath, DEFAULT_CONTEXT_FILENAME),
        `Content from project ${i}`,
      );
      createdFiles.push(filePath);
    }

    // Load memory from all directories
    const result = await loadServerHierarchicalMemory(
      cwd,
      createdFiles.map((f) => path.dirname(f)),
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    // Should have loaded all files
    expect(result.fileCount).toBe(numDirs);
    expect(result.filePaths.length).toBe(numDirs);
    expect(result.filePaths.sort()).toEqual(createdFiles.sort());

    // Content should include all project contents
    for (let i = 0; i < numDirs; i++) {
      expect(result.memoryContent).toContain(`Content from project ${i}`);
    }
  });

  it('should preserve order and prevent duplicates when processing multiple directories', async () => {
    // Create overlapping directory structure
    const parentDir = await createEmptyDir(path.join(testRootDir, 'parent'));
    const childDir = await createEmptyDir(path.join(parentDir, 'child'));

    const parentFile = await createTestFile(
      path.join(parentDir, DEFAULT_CONTEXT_FILENAME),
      'Parent content',
    );
    const childFile = await createTestFile(
      path.join(childDir, DEFAULT_CONTEXT_FILENAME),
      'Child content',
    );

    // Include both parent and child directories
    const result = await loadServerHierarchicalMemory(
      parentDir,
      [childDir, parentDir], // Deliberately include duplicates
      false,
      new FileDiscoveryService(projectRoot),
      new SimpleExtensionLoader([]),
      DEFAULT_FOLDER_TRUST,
    );

    // Should have both files without duplicates
    expect(result.fileCount).toBe(2);
    expect(result.memoryContent).toContain('Parent content');
    expect(result.memoryContent).toContain('Child content');
    expect(result.filePaths.sort()).toEqual([parentFile, childFile].sort());

    // Check that files are not duplicated
    const parentOccurrences = (
      result.memoryContent.match(/Parent content/g) || []
    ).length;
    const childOccurrences = (
      result.memoryContent.match(/Child content/g) || []
    ).length;
    expect(parentOccurrences).toBe(1);
    expect(childOccurrences).toBe(1);
  });

  describe('loadGlobalMemory', () => {
    it('should load global memory file if it exists', async () => {
      const globalMemoryFile = await createTestFile(
        path.join(homedir, GEMINI_DIR, DEFAULT_CONTEXT_FILENAME),
        'Global memory content',
      );

      const result = await loadGlobalMemory();

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(globalMemoryFile);
      expect(result.files[0].content).toBe('Global memory content');
    });

    it('should return empty content if global memory file does not exist', async () => {
      const result = await loadGlobalMemory();

      expect(result.files).toHaveLength(0);
    });
  });

  describe('loadEnvironmentMemory', () => {
    it('should load extension memory', async () => {
      const extFile = await createTestFile(
        path.join(testRootDir, 'ext', 'GEMINI.md'),
        'Extension content',
      );
      const mockExtensionLoader = new SimpleExtensionLoader([
        {
          isActive: true,
          contextFiles: [extFile],
        } as GeminiCLIExtension,
      ]);

      const result = await loadEnvironmentMemory([], mockExtensionLoader);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(extFile);
      expect(result.files[0].content).toBe('Extension content');
    });

    it('should NOT traverse upward beyond trusted root (even with .git)', async () => {
      // Setup: /temp/parent/repo/.git
      const parentDir = await createEmptyDir(path.join(testRootDir, 'parent'));
      const repoDir = await createEmptyDir(path.join(parentDir, 'repo'));
      await createEmptyDir(path.join(repoDir, '.git'));
      const srcDir = await createEmptyDir(path.join(repoDir, 'src'));

      await createTestFile(
        path.join(parentDir, DEFAULT_CONTEXT_FILENAME),
        'Parent content',
      );
      await createTestFile(
        path.join(repoDir, DEFAULT_CONTEXT_FILENAME),
        'Repo content',
      );
      const srcFile = await createTestFile(
        path.join(srcDir, DEFAULT_CONTEXT_FILENAME),
        'Src content',
      );

      // Trust srcDir. Should ONLY load srcFile.
      // Repo and Parent are NOT trusted.
      const result = await loadEnvironmentMemory(
        [srcDir],
        new SimpleExtensionLoader([]),
      );

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(srcFile);
      expect(result.files[0].content).toBe('Src content');
    });

    it('should NOT traverse upward beyond trusted root (no .git)', async () => {
      // Setup: /homedir/docs/notes (no .git anywhere)
      const docsDir = await createEmptyDir(path.join(homedir, 'docs'));
      const notesDir = await createEmptyDir(path.join(docsDir, 'notes'));

      await createTestFile(
        path.join(homedir, DEFAULT_CONTEXT_FILENAME),
        'Home content',
      );
      const docsFile = await createTestFile(
        path.join(docsDir, DEFAULT_CONTEXT_FILENAME),
        'Docs content',
      );

      // Trust notesDir. Should load NOTHING because notesDir has no file,
      // and we do not traverse up to docsDir.
      const resultNotes = await loadEnvironmentMemory(
        [notesDir],
        new SimpleExtensionLoader([]),
      );
      expect(resultNotes.files).toHaveLength(0);

      // Trust docsDir. Should load docsFile, but NOT homeFile.
      const resultDocs = await loadEnvironmentMemory(
        [docsDir],
        new SimpleExtensionLoader([]),
      );
      expect(resultDocs.files).toHaveLength(1);
      expect(resultDocs.files[0].path).toBe(docsFile);
      expect(resultDocs.files[0].content).toBe('Docs content');
    });

    it('should deduplicate paths when same root is trusted multiple times', async () => {
      const repoDir = await createEmptyDir(path.join(testRootDir, 'repo'));
      await createEmptyDir(path.join(repoDir, '.git'));

      const repoFile = await createTestFile(
        path.join(repoDir, DEFAULT_CONTEXT_FILENAME),
        'Repo content',
      );

      // Trust repoDir twice.
      const result = await loadEnvironmentMemory(
        [repoDir, repoDir],
        new SimpleExtensionLoader([]),
      );

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(repoFile);
    });

    it('should keep multiple memory files from the same directory adjacent and in order', async () => {
      // Configure multiple memory filenames
      setGeminiMdFilename(['PRIMARY.md', 'SECONDARY.md']);

      const dir = await createEmptyDir(
        path.join(testRootDir, 'multi_file_dir'),
      );
      await createEmptyDir(path.join(dir, '.git'));

      const primaryFile = await createTestFile(
        path.join(dir, 'PRIMARY.md'),
        'Primary content',
      );
      const secondaryFile = await createTestFile(
        path.join(dir, 'SECONDARY.md'),
        'Secondary content',
      );

      const result = await loadEnvironmentMemory(
        [dir],
        new SimpleExtensionLoader([]),
      );

      expect(result.files).toHaveLength(2);
      // Verify order: PRIMARY should come before SECONDARY because they are
      // sorted by path and PRIMARY.md comes before SECONDARY.md alphabetically
      // if in same dir.
      expect(result.files[0].path).toBe(primaryFile);
      expect(result.files[1].path).toBe(secondaryFile);
      expect(result.files[0].content).toBe('Primary content');
      expect(result.files[1].content).toBe('Secondary content');
    });
  });

  describe('loadJitSubdirectoryMemory', () => {
    it('should load JIT memory when target is inside a trusted root', async () => {
      const rootDir = await createEmptyDir(path.join(testRootDir, 'jit_root'));
      const subDir = await createEmptyDir(path.join(rootDir, 'subdir'));
      const targetFile = path.join(subDir, 'target.txt');

      const subDirMemory = await createTestFile(
        path.join(subDir, DEFAULT_CONTEXT_FILENAME),
        'Subdir JIT content',
      );

      const result = await loadJitSubdirectoryMemory(
        targetFile,
        [rootDir],
        new Set(),
      );

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(subDirMemory);
      expect(result.files[0].content).toBe('Subdir JIT content');
    });

    it('should skip JIT memory when target is outside trusted roots', async () => {
      const trustedRoot = await createEmptyDir(
        path.join(testRootDir, 'trusted'),
      );
      const untrustedDir = await createEmptyDir(
        path.join(testRootDir, 'untrusted'),
      );
      const targetFile = path.join(untrustedDir, 'target.txt');

      await createTestFile(
        path.join(untrustedDir, DEFAULT_CONTEXT_FILENAME),
        'Untrusted content',
      );

      const result = await loadJitSubdirectoryMemory(
        targetFile,
        [trustedRoot],
        new Set(),
      );

      expect(result.files).toHaveLength(0);
    });

    it('should skip already loaded paths', async () => {
      const rootDir = await createEmptyDir(path.join(testRootDir, 'jit_root'));
      const subDir = await createEmptyDir(path.join(rootDir, 'subdir'));
      const targetFile = path.join(subDir, 'target.txt');

      const rootMemory = await createTestFile(
        path.join(rootDir, DEFAULT_CONTEXT_FILENAME),
        'Root content',
      );
      const subDirMemory = await createTestFile(
        path.join(subDir, DEFAULT_CONTEXT_FILENAME),
        'Subdir content',
      );

      // Simulate root memory already loaded (e.g., by loadEnvironmentMemory)
      const alreadyLoaded = new Set([rootMemory]);

      const result = await loadJitSubdirectoryMemory(
        targetFile,
        [rootDir],
        alreadyLoaded,
      );

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(subDirMemory);
      expect(result.files[0].content).toBe('Subdir content');
    });

    it('should use the deepest trusted root when multiple nested roots exist', async () => {
      const outerRoot = await createEmptyDir(path.join(testRootDir, 'outer'));
      const innerRoot = await createEmptyDir(path.join(outerRoot, 'inner'));
      const targetFile = path.join(innerRoot, 'target.txt');

      const outerMemory = await createTestFile(
        path.join(outerRoot, DEFAULT_CONTEXT_FILENAME),
        'Outer content',
      );
      const innerMemory = await createTestFile(
        path.join(innerRoot, DEFAULT_CONTEXT_FILENAME),
        'Inner content',
      );

      const result = await loadJitSubdirectoryMemory(
        targetFile,
        [outerRoot, innerRoot],
        new Set(),
      );

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(innerMemory);
      expect(result.files[0].content).toBe('Inner content');
      // Ensure outer memory is NOT loaded
      expect(result.files.find((f) => f.path === outerMemory)).toBeUndefined();
    });
  });

  it('refreshServerHierarchicalMemory should refresh memory and update config', async () => {
    const extensionLoader = new SimpleExtensionLoader([]);
    const config = new Config({
      sessionId: '1',
      targetDir: cwd,
      cwd,
      debugMode: false,
      model: 'fake-model',
      extensionLoader,
    });
    const result = await loadServerHierarchicalMemory(
      config.getWorkingDir(),
      config.shouldLoadMemoryFromIncludeDirectories()
        ? config.getWorkspaceContext().getDirectories()
        : [],
      config.getDebugMode(),
      config.getFileService(),
      config.getExtensionLoader(),
      config.isTrustedFolder(),
      config.getImportFormat(),
    );
    expect(result.fileCount).equals(0);

    // Now add an extension with a memory file
    const extensionsDir = new Storage(homedir).getExtensionsDir();
    const extensionPath = path.join(extensionsDir, 'new-extension');
    const contextFilePath = path.join(extensionPath, 'CustomContext.md');
    await fsPromises.mkdir(extensionPath, { recursive: true });
    await fsPromises.writeFile(contextFilePath, 'Really cool custom context!');
    await extensionLoader.loadExtension({
      name: 'new-extension',
      isActive: true,
      contextFiles: [contextFilePath],
      version: '1.0.0',
      id: '1234',
      path: extensionPath,
    });

    const mockEventListener = vi.fn();
    coreEvents.on(CoreEvent.MemoryChanged, mockEventListener);
    const refreshResult = await refreshServerHierarchicalMemory(config);
    expect(refreshResult.fileCount).equals(1);
    expect(config.getGeminiMdFileCount()).equals(refreshResult.fileCount);
    expect(refreshResult.memoryContent).toContain(
      'Really cool custom context!',
    );
    expect(config.getUserMemory()).equals(refreshResult.memoryContent);
    expect(refreshResult.filePaths[0]).toContain(
      path.join(extensionPath, 'CustomContext.md'),
    );
    expect(config.getGeminiMdFilePaths()).equals(refreshResult.filePaths);
    expect(mockEventListener).toHaveBeenCalledExactlyOnceWith({
      fileCount: refreshResult.fileCount,
    });
  });

  it('should include MCP instructions in user memory', async () => {
    const mockConfig = {
      getWorkingDir: vi.fn().mockReturnValue(cwd),
      shouldLoadMemoryFromIncludeDirectories: vi.fn().mockReturnValue(false),
      getDebugMode: vi.fn().mockReturnValue(false),
      getFileService: vi
        .fn()
        .mockReturnValue(new FileDiscoveryService(projectRoot)),
      getExtensionLoader: vi
        .fn()
        .mockReturnValue(new SimpleExtensionLoader([])),
      isTrustedFolder: vi.fn().mockReturnValue(true),
      getImportFormat: vi.fn().mockReturnValue('tree'),
      getFileFilteringOptions: vi.fn().mockReturnValue(undefined),
      getDiscoveryMaxDirs: vi.fn().mockReturnValue(200),
      setUserMemory: vi.fn(),
      setGeminiMdFileCount: vi.fn(),
      setGeminiMdFilePaths: vi.fn(),
      getMcpClientManager: vi.fn().mockReturnValue({
        getMcpInstructions: vi
          .fn()
          .mockReturnValue(
            "\n\n# Instructions for MCP Server 'extension-server'\nAlways be polite.",
          ),
      }),
    } as unknown as Config;

    await refreshServerHierarchicalMemory(mockConfig);

    expect(mockConfig.setUserMemory).toHaveBeenCalledWith(
      expect.stringContaining(
        "# Instructions for MCP Server 'extension-server'",
      ),
    );
    expect(mockConfig.setUserMemory).toHaveBeenCalledWith(
      expect.stringContaining('Always be polite.'),
    );
  });
});
