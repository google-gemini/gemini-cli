/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { debugLogger } from './debugLogger.js';
import * as fsPromises from 'node:fs/promises';

let beforeReaddirHook: ((targetPath: string) => Promise<void> | void) | null =
  null;

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const readdir = async (
    ...args: Parameters<typeof actual.readdir>
  ): ReturnType<typeof actual.readdir> => {
    await beforeReaddirHook?.(String(args[0]));
    return actual.readdir(...args);
  };
  return {
    ...actual,
    default: {
      ...actual,
      readdir,
    },
    readdir,
  };
});
import * as os from 'node:os';
import { getFolderStructure } from './getFolderStructure.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import * as path from 'node:path';
import { GEMINI_DIR, resolveToRealPath } from './paths.js';
import { GEMINI_IGNORE_FILE_NAME } from 'src/config/constants.js';

describe('getFolderStructure', () => {
  let testRootDir: string;

  async function createEmptyDir(...pathSegments: string[]) {
    const fullPath = path.join(testRootDir, ...pathSegments);
    await fsPromises.mkdir(fullPath, { recursive: true });
  }

  async function createTestFile(...pathSegments: string[]) {
    const fullPath = path.join(testRootDir, ...pathSegments);
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, '');
    return fullPath;
  }

  beforeEach(async () => {
    testRootDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'folder-structure-test-'),
    );
  });

  afterEach(async () => {
    await fsPromises.rm(testRootDir, { recursive: true, force: true });
  });

  it('should return basic folder structure', async () => {
    await createTestFile('fileA1.ts');
    await createTestFile('fileA2.js');
    await createTestFile('subfolderB', 'fileB1.md');

    const structure = await getFolderStructure(testRootDir);
    expect(structure.trim()).toBe(
      `
Showing up to 200 items (files + folders).

${testRootDir}${path.sep}
├───fileA1.ts
├───fileA2.js
└───subfolderB${path.sep}
    └───fileB1.md
`.trim(),
    );
  });

  it('should handle an empty folder', async () => {
    const structure = await getFolderStructure(testRootDir);
    expect(structure.trim()).toBe(
      `
Showing up to 200 items (files + folders).

${testRootDir}${path.sep}
`
        .trim()
        .trim(),
    );
  });

  it('should ignore folders specified in ignoredFolders (default)', async () => {
    await createTestFile('.hiddenfile');
    await createTestFile('file1.txt');
    await createEmptyDir('emptyFolder');
    await createTestFile('node_modules', 'somepackage', 'index.js');
    await createTestFile('subfolderA', 'fileA1.ts');
    await createTestFile('subfolderA', 'fileA2.js');
    await createTestFile('subfolderA', 'subfolderB', 'fileB1.md');

    const structure = await getFolderStructure(testRootDir);
    expect(structure.trim()).toBe(
      `
Showing up to 200 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (200 items) was reached.

${testRootDir}${path.sep}
├───.hiddenfile
├───file1.txt
├───emptyFolder${path.sep}
├───node_modules${path.sep}...
└───subfolderA${path.sep}
    ├───fileA1.ts
    ├───fileA2.js
    └───subfolderB${path.sep}
        └───fileB1.md
`.trim(),
    );
  });

  it('should ignore folders specified in custom ignoredFolders', async () => {
    await createTestFile('.hiddenfile');
    await createTestFile('file1.txt');
    await createEmptyDir('emptyFolder');
    await createTestFile('node_modules', 'somepackage', 'index.js');
    await createTestFile('subfolderA', 'fileA1.ts');

    const structure = await getFolderStructure(testRootDir, {
      ignoredFolders: new Set(['subfolderA', 'node_modules']),
    });
    const expected = `
Showing up to 200 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (200 items) was reached.

${testRootDir}${path.sep}
├───.hiddenfile
├───file1.txt
├───emptyFolder${path.sep}
├───node_modules${path.sep}...
└───subfolderA${path.sep}...
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should filter files by fileIncludePattern', async () => {
    await createTestFile('fileA1.ts');
    await createTestFile('fileA2.js');
    await createTestFile('subfolderB', 'fileB1.md');

    const structure = await getFolderStructure(testRootDir, {
      fileIncludePattern: /\.ts$/,
    });
    const expected = `
Showing up to 200 items (files + folders).

${testRootDir}${path.sep}
├───fileA1.ts
└───subfolderB${path.sep}
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should handle maxItems truncation for files within a folder', async () => {
    await createTestFile('fileA1.ts');
    await createTestFile('fileA2.js');
    await createTestFile('subfolderB', 'fileB1.md');

    const structure = await getFolderStructure(testRootDir, {
      maxItems: 3,
    });
    const expected = `
Showing up to 3 items (files + folders).

${testRootDir}${path.sep}
├───fileA1.ts
├───fileA2.js
└───subfolderB${path.sep}
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should handle maxItems truncation for subfolders', async () => {
    for (let i = 0; i < 5; i++) {
      await createTestFile(`folder-${i}`, 'child.txt');
    }

    const structure = await getFolderStructure(testRootDir, {
      maxItems: 4,
    });
    const expectedRevised = `
Showing up to 4 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (4 items) was reached.

${testRootDir}${path.sep}
├───folder-0${path.sep}
├───folder-1${path.sep}
├───folder-2${path.sep}
├───folder-3${path.sep}
└───...
`.trim();
    expect(structure.trim()).toBe(expectedRevised);
  });

  it('should handle maxItems that only allows the root folder itself', async () => {
    await createTestFile('fileA1.ts');
    await createTestFile('fileA2.ts');
    await createTestFile('subfolderB', 'fileB1.ts');

    const structure = await getFolderStructure(testRootDir, {
      maxItems: 1,
    });
    const expected = `
Showing up to 1 items (files + folders). Folders or files indicated with ... contain more items not shown, were ignored, or the display limit (1 items) was reached.

${testRootDir}${path.sep}
├───fileA1.ts
├───...
└───...
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should handle non-existent directory', async () => {
    const nonExistentPath = path.join(testRootDir, 'non-existent');
    const structure = await getFolderStructure(nonExistentPath);
    expect(structure).toContain(
      `Error: Could not read directory "${nonExistentPath}". Check path and permissions.`,
    );
  });

  it('should not warn when a transient subdirectory disappears with ENOENT during scan', async () => {
    await createTestFile('fileA.txt');
    await createEmptyDir('projects.json.lock');
    const lockDirPath = path.join(testRootDir, 'projects.json.lock');

    beforeReaddirHook = async (targetPath: string) => {
      if (targetPath === lockDirPath) {
        await fsPromises.rmdir(lockDirPath);
      }
    };
    const warnSpy = vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});

    try {
      const structure = await getFolderStructure(testRootDir);
      expect(structure).toContain('fileA.txt');
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      beforeReaddirHook = null;
      warnSpy.mockRestore();
    }
  });

  it('should still warn when reading a subdirectory fails with EACCES', async () => {
    await createEmptyDir('restricted');
    const restrictedDirPath = path.join(testRootDir, 'restricted');

    beforeReaddirHook = (targetPath: string) => {
      if (targetPath === restrictedDirPath) {
        throw Object.assign(
          new Error(
            `EACCES: permission denied, scandir '${restrictedDirPath}'`,
          ),
          { code: 'EACCES' },
        );
      }
    };
    const warnSpy = vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});

    try {
      await getFolderStructure(testRootDir);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `Warning: Could not read directory ${restrictedDirPath}:`,
        ),
      );
    } finally {
      beforeReaddirHook = null;
      warnSpy.mockRestore();
    }
  });

  it('should return an error message and warn with resolved real path when reading the root directory fails with EACCES', async () => {
    beforeReaddirHook = (targetPath: string) => {
      if (targetPath === testRootDir) {
        throw Object.assign(
          new Error(`EACCES: permission denied, scandir '${testRootDir}'`),
          { code: 'EACCES' },
        );
      }
    };
    const warnSpy = vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});

    try {
      const structure = await getFolderStructure(testRootDir);
      expect(structure).toContain(
        `Error: Could not read directory "${testRootDir}". Check path and permissions.`,
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `Warning: Could not read directory ${resolveToRealPath(testRootDir)}:`,
        ),
      );
    } finally {
      beforeReaddirHook = null;
      warnSpy.mockRestore();
    }
  });

  it('should handle deep folder structure within limits', async () => {
    await createTestFile('level1', 'level2', 'level3', 'file.txt');

    const structure = await getFolderStructure(testRootDir, {
      maxItems: 10,
    });
    const expected = `
Showing up to 10 items (files + folders).

${testRootDir}${path.sep}
└───level1${path.sep}
    └───level2${path.sep}
        └───level3${path.sep}
            └───file.txt
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  it('should truncate deep folder structure if maxItems is small', async () => {
    await createTestFile('level1', 'level2', 'level3', 'file.txt');

    const structure = await getFolderStructure(testRootDir, {
      maxItems: 3,
    });
    const expected = `
Showing up to 3 items (files + folders).

${testRootDir}${path.sep}
└───level1${path.sep}
    └───level2${path.sep}
        └───level3${path.sep}
`.trim();
    expect(structure.trim()).toBe(expected);
  });

  describe('with gitignore', () => {
    beforeEach(async () => {
      await fsPromises.mkdir(path.join(testRootDir, '.git'), {
        recursive: true,
      });
    });

    it('should ignore files and folders specified in .gitignore', async () => {
      await fsPromises.writeFile(
        path.join(testRootDir, '.gitignore'),
        'ignored.txt\nnode_modules/\n.gemini/*\n!/.gemini/config.yaml',
      );
      await createTestFile('file1.txt');
      await createTestFile('node_modules', 'some-package', 'index.js');
      await createTestFile('ignored.txt');
      await createTestFile(GEMINI_DIR, 'config.yaml');
      await createTestFile(GEMINI_DIR, 'logs.json');

      const fileService = new FileDiscoveryService(testRootDir);
      const structure = await getFolderStructure(testRootDir, {
        fileService,
      });

      expect(structure).not.toContain('ignored.txt');
      expect(structure).toContain(`node_modules${path.sep}...`);
      expect(structure).not.toContain('logs.json');
      expect(structure).toContain('config.yaml');
      expect(structure).toContain('file1.txt');
    });

    it('should not ignore files if respectGitIgnore is false', async () => {
      await fsPromises.writeFile(
        path.join(testRootDir, '.gitignore'),
        'ignored.txt',
      );
      await createTestFile('file1.txt');
      await createTestFile('ignored.txt');

      const fileService = new FileDiscoveryService(testRootDir);
      const structure = await getFolderStructure(testRootDir, {
        fileService,
        fileFilteringOptions: {
          respectGeminiIgnore: false,
          respectGitIgnore: false,
          customIgnoreFilePaths: [],
        },
      });

      expect(structure).toContain('ignored.txt');
      expect(structure).toContain('file1.txt');
    });
  });

  describe('with geminiignore', () => {
    it('should ignore geminiignore files by default', async () => {
      await fsPromises.writeFile(
        path.join(testRootDir, GEMINI_IGNORE_FILE_NAME),
        'ignored.txt\nnode_modules/\n.gemini/\n!/.gemini/config.yaml',
      );
      await createTestFile('file1.txt');
      await createTestFile('node_modules', 'some-package', 'index.js');
      await createTestFile('ignored.txt');
      await createTestFile(GEMINI_DIR, 'config.yaml');
      await createTestFile(GEMINI_DIR, 'logs.json');

      const fileService = new FileDiscoveryService(testRootDir);
      const structure = await getFolderStructure(testRootDir, {
        fileService,
      });
      expect(structure).not.toContain('ignored.txt');
      expect(structure).toContain(`node_modules${path.sep}...`);
      expect(structure).not.toContain('logs.json');
    });

    it('should not ignore files if respectGeminiIgnore is false', async () => {
      await fsPromises.writeFile(
        path.join(testRootDir, GEMINI_IGNORE_FILE_NAME),
        'ignored.txt\nnode_modules/\n.gemini/\n!/.gemini/config.yaml',
      );
      await createTestFile('file1.txt');
      await createTestFile('node_modules', 'some-package', 'index.js');
      await createTestFile('ignored.txt');
      await createTestFile(GEMINI_DIR, 'config.yaml');
      await createTestFile(GEMINI_DIR, 'logs.json');

      const fileService = new FileDiscoveryService(testRootDir);
      const structure = await getFolderStructure(testRootDir, {
        fileService,
        fileFilteringOptions: {
          respectGeminiIgnore: false,
          respectGitIgnore: true, // Explicitly disable gemini ignore only
          customIgnoreFilePaths: [],
        },
      });
      expect(structure).toContain('ignored.txt');
      // node_modules is still ignored by default
      expect(structure).toContain(`node_modules${path.sep}...`);
    });
  });
});
