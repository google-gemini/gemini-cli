/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { loadServerHierarchicalMemory } from './memoryDiscovery.js';
import {
  GEMINI_CONFIG_DIR,
  setGeminiMdFilename,
  DEFAULT_CONTEXT_FILENAME,
} from '../tools/memoryTool.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(),
  };
});

describe('loadServerHierarchicalMemory', () => {
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
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    // Some tests set this to a different value.
    setGeminiMdFilename(DEFAULT_CONTEXT_FILENAME);
    // Clean up the temporary directory to prevent resource leaks.
    await fsPromises.rm(testRootDir, { recursive: true, force: true });
  });

  it('should return empty memory and count if no context files are found', async () => {
    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
    );

    expect(result).toEqual({
      memoryContent: '',
      fileCount: 0,
    });
  });

  it('should load only the global context file if present and others are not (default filename)', async () => {
    const defaultContextFile = await createTestFile(
      path.join(homedir, GEMINI_CONFIG_DIR, DEFAULT_CONTEXT_FILENAME),
      'default context content',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, defaultContextFile)} ---\ndefault context content\n--- End of Context from: ${path.relative(cwd, defaultContextFile)} ---`,
      fileCount: 1,
    });
  });

  it('should load only the global custom context file if present and filename is changed', async () => {
    const customFilename = 'CUSTOM_AGENTS.md';
    setGeminiMdFilename(customFilename);

    const customContextFile = await createTestFile(
      path.join(homedir, GEMINI_CONFIG_DIR, customFilename),
      'custom context content',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, customContextFile)} ---\ncustom context content\n--- End of Context from: ${path.relative(cwd, customContextFile)} ---`,
      fileCount: 1,
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
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, projectContextFile)} ---\nproject context content\n--- End of Context from: ${path.relative(cwd, projectContextFile)} ---\n\n--- Context from: ${path.relative(cwd, cwdContextFile)} ---\ncwd context content\n--- End of Context from: ${path.relative(cwd, cwdContextFile)} ---`,
      fileCount: 2,
    });
  });

  it('should load context files by downward traversal with custom filename', async () => {
    const customFilename = 'LOCAL_CONTEXT.md';
    setGeminiMdFilename(customFilename);

    await createTestFile(
      path.join(cwd, 'subdir', customFilename),
      'Subdir custom memory',
    );
    await createTestFile(path.join(cwd, customFilename), 'CWD custom memory');

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${customFilename} ---\nCWD custom memory\n--- End of Context from: ${customFilename} ---\n\n--- Context from: ${path.join('subdir', customFilename)} ---\nSubdir custom memory\n--- End of Context from: ${path.join('subdir', customFilename)} ---`,
      fileCount: 2,
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
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, projectRootGeminiFile)} ---\nProject root memory\n--- End of Context from: ${path.relative(cwd, projectRootGeminiFile)} ---\n\n--- Context from: ${path.relative(cwd, srcGeminiFile)} ---\nSrc directory memory\n--- End of Context from: ${path.relative(cwd, srcGeminiFile)} ---`,
      fileCount: 2,
    });
  });

  it('should load ORIGINAL_GEMINI_MD_FILENAME files by downward traversal from CWD', async () => {
    await createTestFile(
      path.join(cwd, 'subdir', DEFAULT_CONTEXT_FILENAME),
      'Subdir memory',
    );
    await createTestFile(
      path.join(cwd, DEFAULT_CONTEXT_FILENAME),
      'CWD memory',
    );

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${DEFAULT_CONTEXT_FILENAME} ---\nCWD memory\n--- End of Context from: ${DEFAULT_CONTEXT_FILENAME} ---\n\n--- Context from: ${path.join('subdir', DEFAULT_CONTEXT_FILENAME)} ---\nSubdir memory\n--- End of Context from: ${path.join('subdir', DEFAULT_CONTEXT_FILENAME)} ---`,
      fileCount: 2,
    });
  });

  it('should load and correctly order global, upward, and downward ORIGINAL_GEMINI_MD_FILENAME files', async () => {
    const defaultContextFile = await createTestFile(
      path.join(homedir, GEMINI_CONFIG_DIR, DEFAULT_CONTEXT_FILENAME),
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
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, defaultContextFile)} ---\ndefault context content\n--- End of Context from: ${path.relative(cwd, defaultContextFile)} ---\n\n--- Context from: ${path.relative(cwd, rootGeminiFile)} ---\nProject parent memory\n--- End of Context from: ${path.relative(cwd, rootGeminiFile)} ---\n\n--- Context from: ${path.relative(cwd, projectRootGeminiFile)} ---\nProject root memory\n--- End of Context from: ${path.relative(cwd, projectRootGeminiFile)} ---\n\n--- Context from: ${path.relative(cwd, cwdGeminiFile)} ---\nCWD memory\n--- End of Context from: ${path.relative(cwd, cwdGeminiFile)} ---\n\n--- Context from: ${path.relative(cwd, subDirGeminiFile)} ---\nSubdir memory\n--- End of Context from: ${path.relative(cwd, subDirGeminiFile)} ---`,
      fileCount: 5,
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
      [],
      'tree',
      {
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      },
      200, // maxDirs parameter
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, regularSubDirGeminiFile)} ---\nMy code memory\n--- End of Context from: ${path.relative(cwd, regularSubDirGeminiFile)} ---`,
      fileCount: 1,
    });
  });

  it('should respect the maxDirs parameter during downward scan', async () => {
    const consoleDebugSpy = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => {});

    for (let i = 0; i < 100; i++) {
      await createEmptyDir(path.join(cwd, `deep_dir_${i}`));
    }

    // Pass the custom limit directly to the function
    await loadServerHierarchicalMemory(
      cwd,
      [],
      true,
      new FileDiscoveryService(projectRoot),
      [],
      'tree', // importFormat
      {
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      },
      50, // maxDirs
    );

    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG] [BfsFileSearch]'),
      expect.stringContaining('Scanning [50/50]:'),
    );

    vi.mocked(console.debug).mockRestore();

    const result = await loadServerHierarchicalMemory(
      cwd,
      [],
      false,
      new FileDiscoveryService(projectRoot),
    );

    expect(result).toEqual({
      memoryContent: '',
      fileCount: 0,
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
      [extensionFilePath],
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, extensionFilePath)} ---\nExtension memory content\n--- End of Context from: ${path.relative(cwd, extensionFilePath)} ---`,
      fileCount: 1,
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
    );

    expect(result).toEqual({
      memoryContent: `--- Context from: ${path.relative(cwd, includedFile)} ---\nincluded directory memory\n--- End of Context from: ${path.relative(cwd, includedFile)} ---`,
      fileCount: 1,
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
    );

    // Should have loaded all files
    expect(result.fileCount).toBe(numDirs);

    // Content should include all project contents
    for (let i = 0; i < numDirs; i++) {
      expect(result.memoryContent).toContain(`Content from project ${i}`);
    }
  });

  it('should preserve order and prevent duplicates when processing multiple directories', async () => {
    // Create overlapping directory structure
    const parentDir = await createEmptyDir(path.join(testRootDir, 'parent'));
    const childDir = await createEmptyDir(path.join(parentDir, 'child'));

    await createTestFile(
      path.join(parentDir, DEFAULT_CONTEXT_FILENAME),
      'Parent content',
    );
    await createTestFile(
      path.join(childDir, DEFAULT_CONTEXT_FILENAME),
      'Child content',
    );

    // Include both parent and child directories
    const result = await loadServerHierarchicalMemory(
      parentDir,
      [childDir, parentDir], // Deliberately include duplicates
      false,
      new FileDiscoveryService(projectRoot),
    );

    // Should have both files without duplicates
    expect(result.fileCount).toBe(2);
    expect(result.memoryContent).toContain('Parent content');
    expect(result.memoryContent).toContain('Child content');

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
});
