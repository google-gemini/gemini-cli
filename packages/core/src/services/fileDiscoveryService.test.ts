/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileDiscoveryService } from './fileDiscoveryService.js';
import { GEMINI_IGNORE_FILE_NAME } from '../config/constants.js';

describe('FileDiscoveryService', () => {
  let testRootDir: string;
  let projectRoot: string;

  async function createTestFile(filePath: string, content = '') {
    const fullPath = path.join(projectRoot, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
    return fullPath;
  }

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'file-discovery-test-'),
    );
    projectRoot = path.join(testRootDir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should initialize git ignore parser by default in a git repo', async () => {
      await fs.mkdir(path.join(projectRoot, '.git'));
      await createTestFile('.gitignore', 'node_modules/');

      const service = new FileDiscoveryService(projectRoot);
      // Let's check the effect of the parser instead of mocking it.
      expect(service.shouldIgnoreFile('node_modules/foo.js')).toBe(true);
      expect(service.shouldIgnoreFile('src/foo.js')).toBe(false);
    });

    it('should not load git repo patterns when not in a git repo', async () => {
      // No .git directory
      await createTestFile('.gitignore', 'node_modules/');
      const service = new FileDiscoveryService(projectRoot);

      // .gitignore is not loaded in non-git repos
      expect(service.shouldIgnoreFile('node_modules/foo.js')).toBe(false);
    });

    it('should load .geminiignore patterns even when not in a git repo', async () => {
      await createTestFile(GEMINI_IGNORE_FILE_NAME, 'secrets.txt');
      const service = new FileDiscoveryService(projectRoot);

      expect(service.shouldIgnoreFile('secrets.txt')).toBe(true);
      expect(service.shouldIgnoreFile('src/index.js')).toBe(false);
    });

    it('should call applyFilterFilesOptions in constructor', () => {
      const resolveSpy = vi.spyOn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        FileDiscoveryService.prototype as any,
        'applyFilterFilesOptions',
      );
      const options = { respectGitIgnore: false };
      new FileDiscoveryService(projectRoot, options);
      expect(resolveSpy).toHaveBeenCalledWith(options);
    });

    it('should correctly resolve options passed to constructor', () => {
      const options = {
        respectGitIgnore: false,
        respectGeminiIgnore: false,
        customIgnoreFilePaths: ['custom/.ignore'],
      };
      const service = new FileDiscoveryService(projectRoot, options);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const defaults = (service as any).defaultFilterFileOptions;

      expect(defaults.respectGitIgnore).toBe(false);
      expect(defaults.respectGeminiIgnore).toBe(false);
      expect(defaults.customIgnoreFilePaths).toStrictEqual(['custom/.ignore']);
    });

    it('should use defaults when options are not provided', () => {
      const service = new FileDiscoveryService(projectRoot);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const defaults = (service as any).defaultFilterFileOptions;

      expect(defaults.respectGitIgnore).toBe(true);
      expect(defaults.respectGeminiIgnore).toBe(true);
      expect(defaults.customIgnoreFilePaths).toStrictEqual([]);
    });

    it('should partially override defaults', () => {
      const service = new FileDiscoveryService(projectRoot, {
        respectGitIgnore: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const defaults = (service as any).defaultFilterFileOptions;

      expect(defaults.respectGitIgnore).toBe(false);
      expect(defaults.respectGeminiIgnore).toBe(true);
    });
  });

  describe('filterFiles', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(projectRoot, '.git'));
      await createTestFile('.gitignore', 'node_modules/\n.git/\ndist');
      await createTestFile(GEMINI_IGNORE_FILE_NAME, 'logs/');
    });

    it('should filter out git-ignored and gemini-ignored files by default', () => {
      const files = [
        'src/index.ts',
        'node_modules/package/index.js',
        'README.md',
        '.git/config',
        'dist/bundle.js',
        'logs/latest.log',
      ].map((f) => path.join(projectRoot, f));

      const service = new FileDiscoveryService(projectRoot);

      expect(service.filterFiles(files)).toEqual(
        ['src/index.ts', 'README.md'].map((f) => path.join(projectRoot, f)),
      );
    });

    it('should not filter files when respectGitIgnore is false', () => {
      const files = [
        'src/index.ts',
        'node_modules/package/index.js',
        '.git/config',
        'logs/latest.log',
      ].map((f) => path.join(projectRoot, f));

      const service = new FileDiscoveryService(projectRoot);

      const filtered = service.filterFiles(files, {
        respectGitIgnore: false,
        respectGeminiIgnore: true, // still respect this one
      });

      expect(filtered).toEqual(
        ['src/index.ts', 'node_modules/package/index.js', '.git/config'].map(
          (f) => path.join(projectRoot, f),
        ),
      );
    });

    it('should not filter files when respectGeminiIgnore is false', () => {
      const files = [
        'src/index.ts',
        'node_modules/package/index.js',
        'logs/latest.log',
      ].map((f) => path.join(projectRoot, f));

      const service = new FileDiscoveryService(projectRoot);

      const filtered = service.filterFiles(files, {
        respectGitIgnore: true,
        respectGeminiIgnore: false,
      });

      expect(filtered).toEqual(
        ['src/index.ts', 'logs/latest.log'].map((f) =>
          path.join(projectRoot, f),
        ),
      );
    });

    it('should handle empty file list', () => {
      const service = new FileDiscoveryService(projectRoot);

      expect(service.filterFiles([])).toEqual([]);
    });
  });

  describe('filterFilesWithReport', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(projectRoot, '.git'));
      await createTestFile('.gitignore', 'node_modules/');
      await createTestFile(GEMINI_IGNORE_FILE_NAME, '*.log');
    });

    it('should return filtered paths and correct ignored count', () => {
      const files = [
        'src/index.ts',
        'node_modules/package/index.js',
        'debug.log',
        'README.md',
      ].map((f) => path.join(projectRoot, f));

      const service = new FileDiscoveryService(projectRoot);
      const report = service.filterFilesWithReport(files);

      expect(report.filteredPaths).toEqual(
        ['src/index.ts', 'README.md'].map((f) => path.join(projectRoot, f)),
      );
      expect(report.ignoredCount).toBe(2);
    });

    it('should handle no ignored files', () => {
      const files = ['src/index.ts', 'README.md'].map((f) =>
        path.join(projectRoot, f),
      );

      const service = new FileDiscoveryService(projectRoot);
      const report = service.filterFilesWithReport(files);

      expect(report.filteredPaths).toEqual(files);
      expect(report.ignoredCount).toBe(0);
    });
  });

  describe('shouldGitIgnoreFile & shouldGeminiIgnoreFile', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(projectRoot, '.git'));
      await createTestFile('.gitignore', 'node_modules/');
      await createTestFile(GEMINI_IGNORE_FILE_NAME, '*.log');
    });

    it('should return true for git-ignored files', () => {
      const service = new FileDiscoveryService(projectRoot);

      expect(
        service.shouldIgnoreFile(
          path.join(projectRoot, 'node_modules/package/index.js'),
        ),
      ).toBe(true);
    });

    it('should return false for non-git-ignored files', () => {
      const service = new FileDiscoveryService(projectRoot);

      expect(
        service.shouldIgnoreFile(path.join(projectRoot, 'src/index.ts')),
      ).toBe(false);
    });

    it('should return true for gemini-ignored files', () => {
      const service = new FileDiscoveryService(projectRoot);

      expect(
        service.shouldIgnoreFile(path.join(projectRoot, 'debug.log')),
      ).toBe(true);
    });

    it('should return false for non-gemini-ignored files', () => {
      const service = new FileDiscoveryService(projectRoot);

      expect(
        service.shouldIgnoreFile(path.join(projectRoot, 'src/index.ts')),
      ).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle relative project root paths', async () => {
      await fs.mkdir(path.join(projectRoot, '.git'));
      await createTestFile('.gitignore', 'ignored.txt');
      const service = new FileDiscoveryService(
        path.relative(process.cwd(), projectRoot),
      );

      expect(
        service.shouldIgnoreFile(path.join(projectRoot, 'ignored.txt')),
      ).toBe(true);
      expect(
        service.shouldIgnoreFile(path.join(projectRoot, 'not-ignored.txt')),
      ).toBe(false);
    });

    it('should handle filterFiles with undefined options', async () => {
      await fs.mkdir(path.join(projectRoot, '.git'));
      await createTestFile('.gitignore', 'ignored.txt');
      const service = new FileDiscoveryService(projectRoot);

      const files = ['src/index.ts', 'ignored.txt'].map((f) =>
        path.join(projectRoot, f),
      );

      expect(service.filterFiles(files, undefined)).toEqual([
        path.join(projectRoot, 'src/index.ts'),
      ]);
    });
  });
  describe('precedence (.geminiignore over .gitignore)', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(projectRoot, '.git'));
    });

    it('should un-ignore a file in .geminiignore that is ignored in .gitignore', async () => {
      await createTestFile('.gitignore', '*.txt');
      await createTestFile(GEMINI_IGNORE_FILE_NAME, '!important.txt');

      const service = new FileDiscoveryService(projectRoot);
      const files = ['file.txt', 'important.txt'].map((f) =>
        path.join(projectRoot, f),
      );

      const filtered = service.filterFiles(files);
      expect(filtered).toEqual([path.join(projectRoot, 'important.txt')]);
    });

    it('should un-ignore a directory in .geminiignore that is ignored in .gitignore', async () => {
      await createTestFile('.gitignore', 'logs/');
      await createTestFile(GEMINI_IGNORE_FILE_NAME, '!logs/');

      const service = new FileDiscoveryService(projectRoot);
      const files = ['logs/app.log', 'other/app.log'].map((f) =>
        path.join(projectRoot, f),
      );

      const filtered = service.filterFiles(files);
      expect(filtered).toEqual(files);
    });

    it('should extend ignore rules in .geminiignore', async () => {
      await createTestFile('.gitignore', '*.log');
      await createTestFile(GEMINI_IGNORE_FILE_NAME, 'temp/');

      const service = new FileDiscoveryService(projectRoot);
      const files = ['app.log', 'temp/file.txt'].map((f) =>
        path.join(projectRoot, f),
      );

      const filtered = service.filterFiles(files);
      expect(filtered).toEqual([]);
    });

    it('should use .gitignore rules if respectGeminiIgnore is false', async () => {
      await createTestFile('.gitignore', '*.txt');
      await createTestFile(GEMINI_IGNORE_FILE_NAME, '!important.txt');

      const service = new FileDiscoveryService(projectRoot);
      const files = ['file.txt', 'important.txt'].map((f) =>
        path.join(projectRoot, f),
      );

      const filtered = service.filterFiles(files, {
        respectGitIgnore: true,
        respectGeminiIgnore: false,
      });

      expect(filtered).toEqual([]);
    });

    it('should use .geminiignore rules if respectGitIgnore is false', async () => {
      await createTestFile('.gitignore', '*.txt');
      await createTestFile(GEMINI_IGNORE_FILE_NAME, '!important.txt\ntemp/');

      const service = new FileDiscoveryService(projectRoot);
      const files = ['file.txt', 'important.txt', 'temp/file.js'].map((f) =>
        path.join(projectRoot, f),
      );

      const filtered = service.filterFiles(files, {
        respectGitIgnore: false,
        respectGeminiIgnore: true,
      });

      // .gitignore is ignored, so *.txt is not applied.
      // .geminiignore un-ignores important.txt (which wasn't ignored anyway)
      // and ignores temp/
      expect(filtered).toEqual(
        ['file.txt', 'important.txt'].map((f) => path.join(projectRoot, f)),
      );
    });
  });

  describe('custom ignore file', () => {
    it('should respect patterns from a custom ignore file', async () => {
      const customIgnoreName = '.customignore';
      await createTestFile(customIgnoreName, '*.secret');

      const service = new FileDiscoveryService(projectRoot, {
        customIgnoreFilePaths: [customIgnoreName],
      });

      const files = ['file.txt', 'file.secret'].map((f) =>
        path.join(projectRoot, f),
      );

      const filtered = service.filterFiles(files);
      expect(filtered).toEqual([path.join(projectRoot, 'file.txt')]);
    });

    it('should prioritize custom ignore patterns over .geminiignore patterns in git repo', async () => {
      await fs.mkdir(path.join(projectRoot, '.git'));
      await createTestFile('.gitignore', 'node_modules/');
      await createTestFile(GEMINI_IGNORE_FILE_NAME, '*.log');

      const customIgnoreName = '.customignore';
      // .geminiignore ignores *.log, custom un-ignores debug.log
      await createTestFile(customIgnoreName, '!debug.log');

      const service = new FileDiscoveryService(projectRoot, {
        customIgnoreFilePaths: [customIgnoreName],
      });

      const files = ['debug.log', 'error.log'].map((f) =>
        path.join(projectRoot, f),
      );

      const filtered = service.filterFiles(files);
      expect(filtered).toEqual([path.join(projectRoot, 'debug.log')]);
    });

    it('should prioritize custom ignore patterns over .geminiignore patterns in non-git repo', async () => {
      // No .git directory created
      await createTestFile(GEMINI_IGNORE_FILE_NAME, 'secret.txt');

      const customIgnoreName = '.customignore';
      // .geminiignore ignores secret.txt, custom un-ignores it
      await createTestFile(customIgnoreName, '!secret.txt');

      const service = new FileDiscoveryService(projectRoot, {
        customIgnoreFilePaths: [customIgnoreName],
      });

      const files = ['secret.txt'].map((f) => path.join(projectRoot, f));

      const filtered = service.filterFiles(files);
      expect(filtered).toEqual([path.join(projectRoot, 'secret.txt')]);
    });
  });

  describe('getIgnoreFilePaths & getAllIgnoreFilePaths', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(projectRoot, '.git'));
      await createTestFile('.gitignore', '*.log');
      await createTestFile(GEMINI_IGNORE_FILE_NAME, '*.tmp');
      await createTestFile('.customignore', '*.secret');
    });

    it('should return .geminiignore path by default', () => {
      const service = new FileDiscoveryService(projectRoot);
      const paths = service.getIgnoreFilePaths();
      expect(paths).toEqual([path.join(projectRoot, GEMINI_IGNORE_FILE_NAME)]);
    });

    it('should not return .geminiignore path if respectGeminiIgnore is false', () => {
      const service = new FileDiscoveryService(projectRoot, {
        respectGeminiIgnore: false,
      });
      const paths = service.getIgnoreFilePaths();
      expect(paths).toEqual([]);
    });

    it('should return custom ignore file paths', () => {
      const service = new FileDiscoveryService(projectRoot, {
        customIgnoreFilePaths: ['.customignore'],
      });
      const paths = service.getIgnoreFilePaths();
      expect(paths).toContain(path.join(projectRoot, GEMINI_IGNORE_FILE_NAME));
      expect(paths).toContain(path.join(projectRoot, '.customignore'));
    });

    it('should return all ignore paths including .gitignore', () => {
      const service = new FileDiscoveryService(projectRoot);
      const paths = service.getAllIgnoreFilePaths();
      expect(paths).toContain(path.join(projectRoot, GEMINI_IGNORE_FILE_NAME));
      expect(paths).toContain(path.join(projectRoot, '.gitignore'));
    });

    it('should not return .gitignore if respectGitIgnore is false', () => {
      const service = new FileDiscoveryService(projectRoot, {
        respectGitIgnore: false,
      });
      const paths = service.getAllIgnoreFilePaths();
      expect(paths).toContain(path.join(projectRoot, GEMINI_IGNORE_FILE_NAME));
      expect(paths).not.toContain(path.join(projectRoot, '.gitignore'));
    });

    it('should not return .gitignore if it does not exist', async () => {
      await fs.rm(path.join(projectRoot, '.gitignore'));
      const service = new FileDiscoveryService(projectRoot);
      const paths = service.getAllIgnoreFilePaths();
      expect(paths).not.toContain(path.join(projectRoot, '.gitignore'));
      expect(paths).toContain(path.join(projectRoot, GEMINI_IGNORE_FILE_NAME));
    });

    it('should ensure .gitignore is the first file in the list', () => {
      const service = new FileDiscoveryService(projectRoot);
      const paths = service.getAllIgnoreFilePaths();
      expect(paths[0]).toBe(path.join(projectRoot, '.gitignore'));
    });
  });
});
