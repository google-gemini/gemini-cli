/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  createTmpDir,
  cleanupTmpDir,
  type FileSystemStructure,
} from './file-system-test-helpers.js';

describe('file-system-test-helpers', () => {
  let createdDirs: string[] = [];

  afterEach(async () => {
    // Cleanup any directories created during tests
    for (const dir of createdDirs) {
      try {
        await cleanupTmpDir(dir);
      } catch {
        // Ignore errors during cleanup
      }
    }
    createdDirs = [];
  });

  describe('FileSystemStructure type', () => {
    it('should accept simple file structure', () => {
      const structure: FileSystemStructure = {
        'file.txt': 'content',
      };

      expect(structure).toBeDefined();
    });

    it('should accept nested directory structure', () => {
      const structure: FileSystemStructure = {
        dir: {
          'file.txt': 'content',
        },
      };

      expect(structure).toBeDefined();
    });

    it('should accept array of strings', () => {
      const structure: FileSystemStructure = {
        dir: ['file1.txt', 'file2.txt'],
      };

      expect(structure).toBeDefined();
    });

    it('should accept mixed structure', () => {
      const structure: FileSystemStructure = {
        'file.txt': 'content',
        dir1: {
          'nested.txt': 'data',
        },
        dir2: ['empty1.txt', 'empty2.txt'],
      };

      expect(structure).toBeDefined();
    });
  });

  describe('createTmpDir', () => {
    describe('simple files', () => {
      it('should create directory with single file', async () => {
        const structure: FileSystemStructure = {
          'test.txt': 'Hello, world!',
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const filePath = path.join(tmpDir, 'test.txt');
        const content = await fs.readFile(filePath, 'utf-8');

        expect(content).toBe('Hello, world!');
      });

      it('should create multiple files', async () => {
        const structure: FileSystemStructure = {
          'file1.txt': 'content 1',
          'file2.txt': 'content 2',
          'file3.txt': 'content 3',
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const content1 = await fs.readFile(
          path.join(tmpDir, 'file1.txt'),
          'utf-8',
        );
        const content2 = await fs.readFile(
          path.join(tmpDir, 'file2.txt'),
          'utf-8',
        );
        const content3 = await fs.readFile(
          path.join(tmpDir, 'file3.txt'),
          'utf-8',
        );

        expect(content1).toBe('content 1');
        expect(content2).toBe('content 2');
        expect(content3).toBe('content 3');
      });

      it('should create file with empty content', async () => {
        const structure: FileSystemStructure = {
          'empty.txt': '',
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const content = await fs.readFile(
          path.join(tmpDir, 'empty.txt'),
          'utf-8',
        );

        expect(content).toBe('');
      });

      it('should create file with multiline content', async () => {
        const structure: FileSystemStructure = {
          'multiline.txt': 'Line 1\nLine 2\nLine 3',
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const content = await fs.readFile(
          path.join(tmpDir, 'multiline.txt'),
          'utf-8',
        );

        expect(content).toBe('Line 1\nLine 2\nLine 3');
      });

      it('should create file with JSON content', async () => {
        const structure: FileSystemStructure = {
          'config.json': '{"key": "value"}',
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const content = await fs.readFile(
          path.join(tmpDir, 'config.json'),
          'utf-8',
        );

        expect(content).toBe('{"key": "value"}');
      });
    });

    describe('nested directories', () => {
      it('should create nested directory with file', async () => {
        const structure: FileSystemStructure = {
          src: {
            'index.ts': '// main file',
          },
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const content = await fs.readFile(
          path.join(tmpDir, 'src', 'index.ts'),
          'utf-8',
        );

        expect(content).toBe('// main file');
      });

      it('should create deeply nested directories', async () => {
        const structure: FileSystemStructure = {
          a: {
            b: {
              c: {
                'deep.txt': 'deeply nested',
              },
            },
          },
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const content = await fs.readFile(
          path.join(tmpDir, 'a', 'b', 'c', 'deep.txt'),
          'utf-8',
        );

        expect(content).toBe('deeply nested');
      });

      it('should create multiple nested directories', async () => {
        const structure: FileSystemStructure = {
          src: {
            'main.ts': 'source',
          },
          tests: {
            'main.test.ts': 'test',
          },
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const srcContent = await fs.readFile(
          path.join(tmpDir, 'src', 'main.ts'),
          'utf-8',
        );
        const testContent = await fs.readFile(
          path.join(tmpDir, 'tests', 'main.test.ts'),
          'utf-8',
        );

        expect(srcContent).toBe('source');
        expect(testContent).toBe('test');
      });

      it('should create directory with multiple files', async () => {
        const structure: FileSystemStructure = {
          dir: {
            'file1.txt': 'content 1',
            'file2.txt': 'content 2',
          },
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const content1 = await fs.readFile(
          path.join(tmpDir, 'dir', 'file1.txt'),
          'utf-8',
        );
        const content2 = await fs.readFile(
          path.join(tmpDir, 'dir', 'file2.txt'),
          'utf-8',
        );

        expect(content1).toBe('content 1');
        expect(content2).toBe('content 2');
      });
    });

    describe('array structures', () => {
      it('should create empty directory from empty array', async () => {
        const structure: FileSystemStructure = {
          'empty-dir': [],
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const dirPath = path.join(tmpDir, 'empty-dir');
        const stats = await fs.stat(dirPath);

        expect(stats.isDirectory()).toBe(true);
      });

      it('should create directory with empty files from string array', async () => {
        const structure: FileSystemStructure = {
          data: ['file1.txt', 'file2.txt'],
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const content1 = await fs.readFile(
          path.join(tmpDir, 'data', 'file1.txt'),
          'utf-8',
        );
        const content2 = await fs.readFile(
          path.join(tmpDir, 'data', 'file2.txt'),
          'utf-8',
        );

        expect(content1).toBe('');
        expect(content2).toBe('');
      });

      it('should create nested structure within array', async () => {
        const structure: FileSystemStructure = {
          data: [
            'file.txt',
            {
              nested: {
                'deep.txt': 'content',
              },
            },
          ],
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const fileContent = await fs.readFile(
          path.join(tmpDir, 'data', 'file.txt'),
          'utf-8',
        );
        const nestedContent = await fs.readFile(
          path.join(tmpDir, 'data', 'nested', 'deep.txt'),
          'utf-8',
        );

        expect(fileContent).toBe('');
        expect(nestedContent).toBe('content');
      });

      it('should handle multiple nested structures in array', async () => {
        const structure: FileSystemStructure = {
          root: [
            { dir1: { 'file1.txt': 'content 1' } },
            { dir2: { 'file2.txt': 'content 2' } },
          ],
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const content1 = await fs.readFile(
          path.join(tmpDir, 'root', 'dir1', 'file1.txt'),
          'utf-8',
        );
        const content2 = await fs.readFile(
          path.join(tmpDir, 'root', 'dir2', 'file2.txt'),
          'utf-8',
        );

        expect(content1).toBe('content 1');
        expect(content2).toBe('content 2');
      });
    });

    describe('mixed structures', () => {
      it('should handle complex mixed structure', async () => {
        const structure: FileSystemStructure = {
          'root.txt': 'root content',
          src: {
            'main.ts': '// main',
          },
          data: ['users.csv', 'products.json'],
          nested: {
            deep: {
              'file.txt': 'deep content',
            },
          },
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const rootContent = await fs.readFile(
          path.join(tmpDir, 'root.txt'),
          'utf-8',
        );
        const mainContent = await fs.readFile(
          path.join(tmpDir, 'src', 'main.ts'),
          'utf-8',
        );
        const deepContent = await fs.readFile(
          path.join(tmpDir, 'nested', 'deep', 'file.txt'),
          'utf-8',
        );

        expect(rootContent).toBe('root content');
        expect(mainContent).toBe('// main');
        expect(deepContent).toBe('deep content');
      });

      it('should create all types in same structure', async () => {
        const structure: FileSystemStructure = {
          'file.txt': 'content',
          'empty-dir': [],
          'dir-with-files': ['empty1.txt', 'empty2.txt'],
          'nested-dir': {
            'nested-file.txt': 'nested',
          },
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const fileExists = await fs
          .access(path.join(tmpDir, 'file.txt'))
          .then(() => true)
          .catch(() => false);
        const emptyDirExists = await fs
          .access(path.join(tmpDir, 'empty-dir'))
          .then(() => true)
          .catch(() => false);
        const dirWithFilesExists = await fs
          .access(path.join(tmpDir, 'dir-with-files', 'empty1.txt'))
          .then(() => true)
          .catch(() => false);
        const nestedExists = await fs
          .access(path.join(tmpDir, 'nested-dir', 'nested-file.txt'))
          .then(() => true)
          .catch(() => false);

        expect(fileExists).toBe(true);
        expect(emptyDirExists).toBe(true);
        expect(dirWithFilesExists).toBe(true);
        expect(nestedExists).toBe(true);
      });
    });

    describe('directory path', () => {
      it('should return absolute path', async () => {
        const structure: FileSystemStructure = {
          'test.txt': 'content',
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        expect(path.isAbsolute(tmpDir)).toBe(true);
      });

      it('should create directory in system temp location', async () => {
        const structure: FileSystemStructure = {
          'test.txt': 'content',
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        expect(tmpDir).toContain('gemini-cli-test-');
      });

      it('should create unique directories for each call', async () => {
        const structure: FileSystemStructure = {
          'test.txt': 'content',
        };

        const tmpDir1 = await createTmpDir(structure);
        const tmpDir2 = await createTmpDir(structure);
        createdDirs.push(tmpDir1, tmpDir2);

        expect(tmpDir1).not.toBe(tmpDir2);
      });

      it('should create directory that exists', async () => {
        const structure: FileSystemStructure = {
          'test.txt': 'content',
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const stats = await fs.stat(tmpDir);

        expect(stats.isDirectory()).toBe(true);
      });
    });

    describe('special characters', () => {
      it('should handle file names with spaces', async () => {
        const structure: FileSystemStructure = {
          'file with spaces.txt': 'content',
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const content = await fs.readFile(
          path.join(tmpDir, 'file with spaces.txt'),
          'utf-8',
        );

        expect(content).toBe('content');
      });

      it('should handle directory names with special characters', async () => {
        const structure: FileSystemStructure = {
          'dir-with-dashes': {
            'file.txt': 'content',
          },
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const content = await fs.readFile(
          path.join(tmpDir, 'dir-with-dashes', 'file.txt'),
          'utf-8',
        );

        expect(content).toBe('content');
      });

      it('should handle file extensions', async () => {
        const structure: FileSystemStructure = {
          'file.txt': 'text',
          'file.json': 'json',
          'file.ts': 'typescript',
        };

        const tmpDir = await createTmpDir(structure);
        createdDirs.push(tmpDir);

        const txtExists = await fs
          .access(path.join(tmpDir, 'file.txt'))
          .then(() => true)
          .catch(() => false);
        const jsonExists = await fs
          .access(path.join(tmpDir, 'file.json'))
          .then(() => true)
          .catch(() => false);
        const tsExists = await fs
          .access(path.join(tmpDir, 'file.ts'))
          .then(() => true)
          .catch(() => false);

        expect(txtExists).toBe(true);
        expect(jsonExists).toBe(true);
        expect(tsExists).toBe(true);
      });
    });
  });

  describe('cleanupTmpDir', () => {
    it('should delete directory with single file', async () => {
      const structure: FileSystemStructure = {
        'test.txt': 'content',
      };

      const tmpDir = await createTmpDir(structure);
      await cleanupTmpDir(tmpDir);

      const exists = await fs
        .access(tmpDir)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });

    it('should delete directory with nested structure', async () => {
      const structure: FileSystemStructure = {
        src: {
          nested: {
            'deep.txt': 'content',
          },
        },
      };

      const tmpDir = await createTmpDir(structure);
      await cleanupTmpDir(tmpDir);

      const exists = await fs
        .access(tmpDir)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });

    it('should delete directory with multiple files', async () => {
      const structure: FileSystemStructure = {
        'file1.txt': 'content 1',
        'file2.txt': 'content 2',
        'file3.txt': 'content 3',
      };

      const tmpDir = await createTmpDir(structure);
      await cleanupTmpDir(tmpDir);

      const exists = await fs
        .access(tmpDir)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });

    it('should delete complex directory structure', async () => {
      const structure: FileSystemStructure = {
        'root.txt': 'root',
        src: {
          'main.ts': 'main',
        },
        data: ['file1.txt', 'file2.txt'],
        nested: {
          deep: {
            'file.txt': 'deep',
          },
        },
      };

      const tmpDir = await createTmpDir(structure);
      await cleanupTmpDir(tmpDir);

      const exists = await fs
        .access(tmpDir)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });

    it('should not throw when directory does not exist', async () => {
      const nonExistentDir = '/tmp/non-existent-dir-12345';

      await expect(cleanupTmpDir(nonExistentDir)).resolves.not.toThrow();
    });

    it('should handle empty directory', async () => {
      const structure: FileSystemStructure = {
        'empty-dir': [],
      };

      const tmpDir = await createTmpDir(structure);
      await cleanupTmpDir(tmpDir);

      const exists = await fs
        .access(tmpDir)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });

    it('should delete directory recursively', async () => {
      const structure: FileSystemStructure = {
        a: {
          b: {
            c: {
              d: {
                'file.txt': 'deep',
              },
            },
          },
        },
      };

      const tmpDir = await createTmpDir(structure);
      await cleanupTmpDir(tmpDir);

      const exists = await fs
        .access(tmpDir)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should create and cleanup successfully', async () => {
      const structure: FileSystemStructure = {
        'test.txt': 'content',
      };

      const tmpDir = await createTmpDir(structure);

      // Verify creation
      const content = await fs.readFile(path.join(tmpDir, 'test.txt'), 'utf-8');
      expect(content).toBe('content');

      // Cleanup
      await cleanupTmpDir(tmpDir);

      // Verify cleanup
      const exists = await fs
        .access(tmpDir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it('should handle multiple create and cleanup cycles', async () => {
      const structure: FileSystemStructure = {
        'test.txt': 'content',
      };

      for (let i = 0; i < 3; i++) {
        const tmpDir = await createTmpDir(structure);
        const exists = await fs
          .access(tmpDir)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(true);

        await cleanupTmpDir(tmpDir);
        const existsAfter = await fs
          .access(tmpDir)
          .then(() => true)
          .catch(() => false);
        expect(existsAfter).toBe(false);
      }
    });

    it('should support typical test scenario', async () => {
      // Setup
      const structure: FileSystemStructure = {
        'package.json': '{"name": "test"}',
        src: {
          'index.ts': 'export {}',
        },
        'README.md': '# Test Project',
      };

      const tmpDir = await createTmpDir(structure);

      // Test
      const pkgContent = await fs.readFile(
        path.join(tmpDir, 'package.json'),
        'utf-8',
      );
      expect(pkgContent).toBe('{"name": "test"}');

      const indexContent = await fs.readFile(
        path.join(tmpDir, 'src', 'index.ts'),
        'utf-8',
      );
      expect(indexContent).toBe('export {}');

      // Cleanup
      await cleanupTmpDir(tmpDir);

      const exists = await fs
        .access(tmpDir)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });
  });
});
