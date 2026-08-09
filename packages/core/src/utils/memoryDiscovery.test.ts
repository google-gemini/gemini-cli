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
  deduplicatePathsByFileIdentity,
  getGlobalMemoryPaths,
  getExtensionMemoryPaths,
  getEnvironmentMemoryPaths,
  getUserProjectMemoryPaths,
  loadJitSubdirectoryMemory,
  readGeminiMdFiles,
} from './memoryDiscovery.js';
import {
  setGeminiMdFilename,
  DEFAULT_CONTEXT_FILENAME,
  PROJECT_MEMORY_INDEX_FILENAME,
} from '../tools/memoryTool.js';
import {
  GEMINI_DIR,
  toAbsolutePath,
  homedir as pathsHomedir,
} from './paths.js';
import type { GeminiCLIExtension } from '../config/config.js';
import { SimpleExtensionLoader } from './extensionLoader.js';

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
    normalizePath: (p: string) => {
      const resolved = path.resolve(p);
      return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    },
    homedir: vi.fn(),
  };
});

describe('memoryDiscovery', () => {
  let testRootDir: string;
  let projectRoot: string;
  let homedir: string;

  async function createEmptyDir(fullPath: string) {
    await fsPromises.mkdir(fullPath, { recursive: true });
    return toAbsolutePath(fullPath);
  }

  async function createTestFile(fullPath: string, fileContents: string) {
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, fileContents);
    return toAbsolutePath(path.resolve(testRootDir, fullPath));
  }

  beforeEach(async () => {
    testRootDir = toAbsolutePath(
      await fsPromises.mkdtemp(
        path.join(os.tmpdir(), 'folder-structure-test-'),
      ),
    );

    vi.resetAllMocks();
    // Set environment variables to indicate test environment
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VITEST', 'true');

    projectRoot = await createEmptyDir(path.join(testRootDir, 'project'));
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

  describe('EISDIR handling for GEMINI.md as a directory', () => {
    it('readGeminiMdFiles returns null content (without throwing) when path is a directory', async () => {
      const dirAsFilePath = await createEmptyDir(
        path.join(projectRoot, DEFAULT_CONTEXT_FILENAME),
      );

      const results = await readGeminiMdFiles([dirAsFilePath]);

      expect(results).toHaveLength(1);
      expect(results[0].filePath).toBe(dirAsFilePath);
      expect(results[0].content).toBeNull();
    });
  });

  describe('getGlobalMemoryPaths', () => {
    it('should find global memory file if it exists', async () => {
      const globalMemoryFile = await createTestFile(
        path.join(homedir, GEMINI_DIR, DEFAULT_CONTEXT_FILENAME),
        'Global memory content',
      );

      const result = await getGlobalMemoryPaths();

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(globalMemoryFile);
    });

    it('should return empty array if global memory file does not exist', async () => {
      const result = await getGlobalMemoryPaths();

      expect(result).toHaveLength(0);
    });
  });

  describe('getUserProjectMemoryPaths', () => {
    it('should find MEMORY.md when it exists', async () => {
      const memoryDir = await createEmptyDir(path.join(testRootDir, 'memdir1'));
      const memoryFile = await createTestFile(
        path.join(memoryDir, PROJECT_MEMORY_INDEX_FILENAME),
        'project memory',
      );

      const result = await getUserProjectMemoryPaths(memoryDir);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(memoryFile);
    });

    it('should preserve the on-disk casing of the index filename', async () => {
      // Regression: paths surfaced through /memory list and /memory show
      // were previously lowercased on macOS/Windows because they passed
      // through normalizePath. The MEMORY.md filename must be kept as-is
      // for display.
      const memoryDir = await createEmptyDir(path.join(testRootDir, 'memdir2'));
      await createTestFile(
        path.join(memoryDir, PROJECT_MEMORY_INDEX_FILENAME),
        'project memory',
      );

      const result = await getUserProjectMemoryPaths(memoryDir);

      expect(result).toHaveLength(1);
      expect(result[0]).toContain(PROJECT_MEMORY_INDEX_FILENAME);
      expect(result[0]).not.toContain(
        PROJECT_MEMORY_INDEX_FILENAME.toLowerCase(),
      );
    });

    it('should fall back to legacy GEMINI.md when MEMORY.md is absent', async () => {
      const memoryDir = await createEmptyDir(path.join(testRootDir, 'memdir3'));
      const legacyFile = await createTestFile(
        path.join(memoryDir, DEFAULT_CONTEXT_FILENAME),
        'legacy memory',
      );

      const result = await getUserProjectMemoryPaths(memoryDir);

      expect(result).toContain(legacyFile);
    });

    it('should return empty array when neither MEMORY.md nor GEMINI.md exists', async () => {
      const memoryDir = await createEmptyDir(path.join(testRootDir, 'memdir4'));

      const result = await getUserProjectMemoryPaths(memoryDir);

      expect(result).toHaveLength(0);
    });
  });

  describe('getExtensionMemoryPaths', () => {
    it('should return active extension context files', async () => {
      const extFile = await createTestFile(
        path.join(testRootDir, 'ext', 'GEMINI.md'),
        'Extension content',
      );
      const loader = new SimpleExtensionLoader([
        {
          isActive: true,
          contextFiles: [extFile],
        } as GeminiCLIExtension,
      ]);

      const result = getExtensionMemoryPaths(loader);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(extFile);
    });

    it('should ignore inactive extensions', async () => {
      const extFile = await createTestFile(
        path.join(testRootDir, 'ext', 'GEMINI.md'),
        'Extension content',
      );
      const loader = new SimpleExtensionLoader([
        {
          isActive: false,
          contextFiles: [extFile],
        } as GeminiCLIExtension,
      ]);

      const result = getExtensionMemoryPaths(loader);

      expect(result).toHaveLength(0);
    });
  });

  describe('getEnvironmentMemoryPaths', () => {
    it('should traverse upward from trusted root to git root', async () => {
      // Setup: /temp/parent/repo/.git
      const parentDir = await createEmptyDir(path.join(testRootDir, 'parent'));
      const repoDir = await createEmptyDir(path.join(parentDir, 'repo'));
      await createEmptyDir(path.join(repoDir, '.git'));
      const srcDir = await createEmptyDir(path.join(repoDir, 'src'));

      await createTestFile(
        path.join(parentDir, DEFAULT_CONTEXT_FILENAME),
        'Parent content',
      );
      const repoFile = await createTestFile(
        path.join(repoDir, DEFAULT_CONTEXT_FILENAME),
        'Repo content',
      );
      const srcFile = await createTestFile(
        path.join(srcDir, DEFAULT_CONTEXT_FILENAME),
        'Src content',
      );

      // Trust srcDir. Should load srcFile AND repoFile (git root),
      // but NOT parentFile (above git root).
      const result = await getEnvironmentMemoryPaths([srcDir]);

      expect(result).toHaveLength(2);
      expect(result).toContain(repoFile);
      expect(result).toContain(srcFile);
    });

    it('should fall back to trusted root as ceiling when no .git exists', async () => {
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

      // No .git, so ceiling falls back to the trusted root itself.
      // notesDir has no GEMINI.md and won't traverse up to docsDir.
      const resultNotes = await getEnvironmentMemoryPaths([notesDir]);
      expect(resultNotes).toHaveLength(0);

      // docsDir has a GEMINI.md at the trusted root itself, so it's found.
      const resultDocs = await getEnvironmentMemoryPaths([docsDir]);
      expect(resultDocs).toHaveLength(1);
      expect(resultDocs[0]).toBe(docsFile);
    });

    it('should deduplicate paths when same root is trusted multiple times', async () => {
      const repoDir = await createEmptyDir(path.join(testRootDir, 'repo'));
      await createEmptyDir(path.join(repoDir, '.git'));

      const repoFile = await createTestFile(
        path.join(repoDir, DEFAULT_CONTEXT_FILENAME),
        'Repo content',
      );

      // Trust repoDir twice.
      const result = await getEnvironmentMemoryPaths([repoDir, repoDir]);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(repoFile);
    });

    it('should preserve case-distinct files before identity deduplication', async () => {
      const platformSpy = vi
        .spyOn(process, 'platform', 'get')
        .mockReturnValue('win32');
      vi.resetModules();
      vi.doMock('node:fs/promises', async () => {
        const actual =
          await vi.importActual<typeof fsPromises>('node:fs/promises');
        return {
          ...actual,
          access: vi.fn().mockResolvedValue(undefined),
          stat: vi.fn(async (filePath) => {
            const normalizedPath = String(filePath).replace(/\\/g, '/');
            return {
              dev: 1,
              ino: normalizedPath.endsWith('/GEMINI.md') ? 101 : 202,
            };
          }),
        };
      });

      try {
        const paths = await import('./paths.js');
        const memoryTool = await import('../tools/memoryTool.js');
        const memoryDiscovery = await import('./memoryDiscovery.js');
        vi.mocked(paths.homedir).mockReturnValue('/home/tester');
        memoryTool.setGeminiMdFilename(['GEMINI.md', 'gemini.md']);

        const result = await memoryDiscovery.getEnvironmentMemoryPaths(
          ['/case-root'],
          [],
        );

        expect(result).toEqual([
          paths.toAbsolutePath('/case-root/GEMINI.md'),
          paths.toAbsolutePath('/case-root/gemini.md'),
        ]);
      } finally {
        platformSpy.mockRestore();
        vi.doUnmock('node:fs/promises');
        vi.resetModules();
      }
    });

    it('should recognize .git as a file (submodules/worktrees)', async () => {
      const repoDir = await createEmptyDir(
        path.join(testRootDir, 'worktree_repo'),
      );
      // .git as a file, like in submodules and worktrees
      await createTestFile(
        path.join(repoDir, '.git'),
        'gitdir: /some/other/path/.git/worktrees/worktree_repo',
      );
      const srcDir = await createEmptyDir(path.join(repoDir, 'src'));

      const repoFile = await createTestFile(
        path.join(repoDir, DEFAULT_CONTEXT_FILENAME),
        'Repo content',
      );
      const srcFile = await createTestFile(
        path.join(srcDir, DEFAULT_CONTEXT_FILENAME),
        'Src content',
      );

      // Trust srcDir. Should traverse up to repoDir (git root via .git file).
      const result = await getEnvironmentMemoryPaths([srcDir]);

      expect(result).toHaveLength(2);
      expect(result).toContain(repoFile);
      expect(result).toContain(srcFile);
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

      const result = await getEnvironmentMemoryPaths([dir]);

      expect(result).toHaveLength(2);
      // Verify order: PRIMARY should come before SECONDARY because they are
      // sorted by path and PRIMARY.md comes before SECONDARY.md alphabetically
      // if in same dir.
      expect(result[0]).toBe(primaryFile);
      expect(result[1]).toBe(secondaryFile);
    });
  });

  describe('file identity deduplication', () => {
    it('should deduplicate files that point to the same inode (same physical file)', async () => {
      const geminiFile = await createTestFile(
        path.join(projectRoot, 'gemini.md'),
        'Project root memory',
      );

      // create hard link to simulate case-insensitive filesystem behavior
      const geminiFileLink = path.join(projectRoot, 'GEMINI.md');
      try {
        await fsPromises.link(geminiFile, geminiFileLink);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes('cross-device') ||
          errorMessage.includes('EXDEV') ||
          errorMessage.includes('EEXIST')
        ) {
          return;
        }
        throw error;
      }

      const stats1 = await fsPromises.lstat(geminiFile);
      const stats2 = await fsPromises.lstat(geminiFileLink);
      expect(stats1.ino).toBe(stats2.ino);
      expect(stats1.dev).toBe(stats2.dev);

      const result = await deduplicatePathsByFileIdentity([
        geminiFileLink,
        geminiFile,
      ]);

      expect(result.paths).toHaveLength(1);
      expect(result.identityMap.get(geminiFile)).toBe(
        result.identityMap.get(geminiFileLink),
      );

      try {
        await fsPromises.unlink(geminiFileLink);
      } catch {
        // ignore cleanup errors
      }
    });

    it('should handle case where files have different inodes (different files)', async () => {
      const geminiFileLower = await createTestFile(
        path.join(projectRoot, 'gemini.md'),
        'Lowercase file content',
      );
      const geminiFileUpper = await createTestFile(
        path.join(projectRoot, 'GEMINI.md'),
        'Uppercase file content',
      );

      const stats1 = await fsPromises.lstat(geminiFileLower);
      const stats2 = await fsPromises.lstat(geminiFileUpper);

      if (stats1.ino !== stats2.ino || stats1.dev !== stats2.dev) {
        const result = await deduplicatePathsByFileIdentity([
          geminiFileLower,
          geminiFileUpper,
        ]);

        expect(result.paths).toHaveLength(2);
        expect(result.paths).toContain(geminiFileLower);
        expect(result.paths).toContain(geminiFileUpper);
      }
    });

    it("should handle files that cannot be stat'd (missing files)", async () => {
      const geminiFile = await createTestFile(
        path.join(projectRoot, 'gemini.md'),
        'Valid file content',
      );
      const missingFile = path.join(projectRoot, 'missing.md');

      const result = await deduplicatePathsByFileIdentity([
        geminiFile,
        missingFile,
      ]);

      expect(result.paths).toEqual([geminiFile, missingFile]);
      expect(result.identityMap.has(missingFile)).toBe(false);
    });

    it('should deduplicate multiple paths pointing to same file (3+ duplicates)', async () => {
      const geminiFile = await createTestFile(
        path.join(projectRoot, 'gemini.md'),
        'Project root memory',
      );

      const link1 = path.join(projectRoot, 'GEMINI.md');
      const link2 = path.join(projectRoot, 'Gemini.md');

      try {
        await fsPromises.link(geminiFile, link1);
        await fsPromises.link(geminiFile, link2);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes('cross-device') ||
          errorMessage.includes('EXDEV') ||
          errorMessage.includes('EEXIST')
        ) {
          return;
        }
        throw error;
      }

      const stats1 = await fsPromises.lstat(geminiFile);
      const stats2 = await fsPromises.lstat(link1);
      const stats3 = await fsPromises.lstat(link2);
      expect(stats1.ino).toBe(stats2.ino);
      expect(stats1.ino).toBe(stats3.ino);

      const result = await deduplicatePathsByFileIdentity([
        geminiFile,
        link1,
        link2,
      ]);

      expect(result.paths).toHaveLength(1);
      expect(result.identityMap.get(geminiFile)).toBe(
        result.identityMap.get(link1),
      );
      expect(result.identityMap.get(geminiFile)).toBe(
        result.identityMap.get(link2),
      );

      try {
        await fsPromises.unlink(link1);
        await fsPromises.unlink(link2);
      } catch {
        // ignore cleanup errors
      }
    });
  });

  describe('loadJitSubdirectoryMemory', () => {
    it('should load JIT memory when target is inside a trusted root', async () => {
      const rootDir = await createEmptyDir(path.join(testRootDir, 'jit_root'));
      await createEmptyDir(path.join(rootDir, '.git'));
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
      await createEmptyDir(path.join(rootDir, '.git'));
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

    it('should deduplicate files in JIT memory loading (same inode)', async () => {
      const rootDir = await createEmptyDir(path.join(testRootDir, 'jit_root'));
      await createEmptyDir(path.join(rootDir, '.git'));
      const subDir = await createEmptyDir(path.join(rootDir, 'subdir'));
      const targetFile = path.join(subDir, 'target.txt');

      const geminiFile = await createTestFile(
        path.join(subDir, 'gemini.md'),
        'JIT memory content',
      );

      const geminiFileLink = path.join(subDir, 'GEMINI.md');
      try {
        await fsPromises.link(geminiFile, geminiFileLink);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes('cross-device') ||
          errorMessage.includes('EXDEV') ||
          errorMessage.includes('EEXIST')
        ) {
          return;
        }
        throw error;
      }

      const stats1 = await fsPromises.lstat(geminiFile);
      const stats2 = await fsPromises.lstat(geminiFileLink);
      expect(stats1.ino).toBe(stats2.ino);

      setGeminiMdFilename(['gemini.md', 'GEMINI.md']);

      const result = await loadJitSubdirectoryMemory(
        targetFile,
        [rootDir],
        new Set(),
      );

      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toBe('JIT memory content');
      const contentMatches =
        result.files[0].content.match(/JIT memory content/g);
      expect(contentMatches).toHaveLength(1);

      try {
        await fsPromises.unlink(geminiFileLink);
      } catch {
        // ignore cleanup errors
      }
    });

    it('should use the deepest trusted root when multiple nested roots exist', async () => {
      const outerRoot = await createEmptyDir(path.join(testRootDir, 'outer'));
      await createEmptyDir(path.join(outerRoot, '.git'));
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

      // Traversal goes from innerRoot (deepest trusted root) up to outerRoot
      // (git root), so both files are found.
      expect(result.files).toHaveLength(2);
      expect(result.files.find((f) => f.path === innerMemory)).toBeDefined();
      expect(result.files.find((f) => f.path === outerMemory)).toBeDefined();
    });

    it('should resolve file target to its parent directory for traversal', async () => {
      const rootDir = await createEmptyDir(
        path.join(testRootDir, 'jit_file_resolve'),
      );
      await createEmptyDir(path.join(rootDir, '.git'));
      const subDir = await createEmptyDir(path.join(rootDir, 'src'));

      // Create the target file so fs.stat can identify it as a file
      const targetFile = await createTestFile(
        path.join(subDir, 'app.ts'),
        'const x = 1;',
      );

      const subDirMemory = await createTestFile(
        path.join(subDir, DEFAULT_CONTEXT_FILENAME),
        'Src context rules',
      );

      const result = await loadJitSubdirectoryMemory(
        targetFile,
        [rootDir],
        new Set(),
      );

      // Should find the GEMINI.md in the same directory as the file
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(subDirMemory);
      expect(result.files[0].content).toBe('Src context rules');
    });

    it('should handle non-existent file target by using parent directory', async () => {
      const rootDir = await createEmptyDir(
        path.join(testRootDir, 'jit_nonexistent'),
      );
      await createEmptyDir(path.join(rootDir, '.git'));
      const subDir = await createEmptyDir(path.join(rootDir, 'src'));

      // Target file does NOT exist (e.g. write_file creating a new file)
      const targetFile = path.join(subDir, 'new-file.ts');

      const subDirMemory = await createTestFile(
        path.join(subDir, DEFAULT_CONTEXT_FILENAME),
        'Rules for new files',
      );

      const result = await loadJitSubdirectoryMemory(
        targetFile,
        [rootDir],
        new Set(),
      );

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(subDirMemory);
      expect(result.files[0].content).toBe('Rules for new files');
    });

    it('should fall back to trusted root as ceiling when no git root exists', async () => {
      const rootDir = await createEmptyDir(
        path.join(testRootDir, 'jit_no_git'),
      );
      // No .git directory created — ceiling falls back to trusted root
      const subDir = await createEmptyDir(path.join(rootDir, 'subdir'));
      const targetFile = path.join(subDir, 'target.txt');

      const subDirMemory = await createTestFile(
        path.join(subDir, DEFAULT_CONTEXT_FILENAME),
        'Content without git',
      );

      const result = await loadJitSubdirectoryMemory(
        targetFile,
        [rootDir],
        new Set(),
      );

      // subDir is within the trusted root, so its GEMINI.md is found
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(subDirMemory);
      expect(result.files[0].content).toBe('Content without git');
    });

    it('should stop at a custom boundary marker instead of .git', async () => {
      const rootDir = await createEmptyDir(
        path.join(testRootDir, 'custom_marker'),
      );
      // Use a custom marker file instead of .git
      await createTestFile(path.join(rootDir, '.monorepo-root'), '');
      const subDir = await createEmptyDir(path.join(rootDir, 'packages/app'));
      const targetFile = path.join(subDir, 'file.ts');

      const rootMemory = await createTestFile(
        path.join(rootDir, DEFAULT_CONTEXT_FILENAME),
        'Root rules',
      );
      const subDirMemory = await createTestFile(
        path.join(subDir, DEFAULT_CONTEXT_FILENAME),
        'App rules',
      );

      const result = await loadJitSubdirectoryMemory(
        targetFile,
        [rootDir],
        new Set(),
        undefined,
        ['.monorepo-root'],
      );

      expect(result.files).toHaveLength(2);
      expect(result.files.find((f) => f.path === rootMemory)).toBeDefined();
      expect(result.files.find((f) => f.path === subDirMemory)).toBeDefined();
    });

    it('should support multiple boundary markers', async () => {
      const rootDir = await createEmptyDir(
        path.join(testRootDir, 'multi_marker'),
      );
      // Use a non-.git marker
      await createTestFile(path.join(rootDir, 'package.json'), '{}');
      const subDir = await createEmptyDir(path.join(rootDir, 'src'));
      const targetFile = path.join(subDir, 'index.ts');

      const rootMemory = await createTestFile(
        path.join(rootDir, DEFAULT_CONTEXT_FILENAME),
        'Root content',
      );

      const result = await loadJitSubdirectoryMemory(
        targetFile,
        [rootDir],
        new Set(),
        undefined,
        ['.git', 'package.json'],
      );

      // Should find the root because package.json is a marker
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe(rootMemory);
    });

    it('should disable parent traversal when boundary markers array is empty', async () => {
      const rootDir = await createEmptyDir(
        path.join(testRootDir, 'empty_markers'),
      );
      await createEmptyDir(path.join(rootDir, '.git'));
      const subDir = await createEmptyDir(path.join(rootDir, 'subdir'));
      const targetFile = path.join(subDir, 'target.txt');

      await createTestFile(
        path.join(rootDir, DEFAULT_CONTEXT_FILENAME),
        'Root content',
      );
      const subDirMemory = await createTestFile(
        path.join(subDir, DEFAULT_CONTEXT_FILENAME),
        'Subdir content',
      );

      const result = await loadJitSubdirectoryMemory(
        targetFile,
        [rootDir],
        new Set(),
        undefined,
        [],
      );

      // With empty markers, no project root is found so the trusted root
      // is used as the ceiling. Traversal still finds files between the
      // target path and the trusted root.
      expect(result.files).toHaveLength(2);
      expect(result.files.find((f) => f.path === subDirMemory)).toBeDefined();
    });
  });
});
