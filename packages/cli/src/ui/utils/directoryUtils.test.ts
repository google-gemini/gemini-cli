/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect } from 'vitest';
import type { Mock } from 'vitest';
import { expandHomeDir, getDirectorySuggestions } from './directoryUtils.js';
import type * as osActual from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...original,
    loadServerHierarchicalMemory: vi.fn().mockResolvedValue({
      memoryContent: 'mock memory',
      fileCount: 10,
      filePaths: ['/a/b/c.md'],
    }),
  };
});

const mockHomeDir =
  process.platform === 'win32' ? 'C:\\Users\\testuser' : '/home/testuser';

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof osActual>();
  return {
    ...original,
    homedir: vi.fn(() => mockHomeDir),
  };
});

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
}));

describe('directoryUtils', () => {
  describe('expandHomeDir', () => {
    it('should expand ~ to the home directory', () => {
      expect(expandHomeDir('~')).toBe(mockHomeDir);
    });

    it('should expand ~/path to the home directory path', () => {
      const expected = path.join(mockHomeDir, 'Documents');
      expect(expandHomeDir('~/Documents')).toBe(expected);
    });

    it('should expand %userprofile% on Windows', () => {
      if (process.platform === 'win32') {
        const expected = path.join(mockHomeDir, 'Desktop');
        expect(expandHomeDir('%userprofile%\\Desktop')).toBe(expected);
      }
    });

    it('should not change a path that does not need expansion', () => {
      const regularPath = path.join('usr', 'local', 'bin');
      expect(expandHomeDir(regularPath)).toBe(regularPath);
    });

    it('should return an empty string if input is empty', () => {
      expect(expandHomeDir('')).toBe('');
    });
  });

  describe('getDirectorySuggestions', () => {
    it('should return suggestions for an empty path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      (fs.readdirSync as Mock).mockReturnValue([
        { name: 'docs', isDirectory: () => true },
        { name: 'src', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
      ]);

      const suggestions = getDirectorySuggestions('');
      expect(suggestions).toEqual([`docs${path.sep}`, `src${path.sep}`]);
    });

    it('should return suggestions for a partial path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      (fs.readdirSync as Mock).mockReturnValue([
        { name: 'docs', isDirectory: () => true },
        { name: 'src', isDirectory: () => true },
      ]);

      const suggestions = getDirectorySuggestions('d');
      expect(suggestions).toEqual([`docs${path.sep}`]);
    });

    it('should return suggestions for a path with trailing slash', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      (fs.readdirSync as Mock).mockReturnValue([
        { name: 'sub', isDirectory: () => true },
      ]);

      const suggestions = getDirectorySuggestions('docs/');
      expect(suggestions).toEqual([`docs/sub${path.sep}`]);
    });

    it('should return suggestions for a path with ~', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      (fs.readdirSync as Mock).mockReturnValue([
        { name: 'Downloads', isDirectory: () => true },
      ]);

      const suggestions = getDirectorySuggestions('~/');
      expect(suggestions).toEqual([`~/Downloads${path.sep}`]);
    });

    it('should return suggestions for a partial path with ~', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      (fs.readdirSync as Mock).mockReturnValue([
        { name: 'Downloads', isDirectory: () => true },
      ]);

      const suggestions = getDirectorySuggestions('~/Down');
      expect(suggestions).toEqual([`~/Downloads${path.sep}`]);
    });

    it('should return suggestions for ../', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      (fs.readdirSync as Mock).mockReturnValue([
        { name: 'other-project', isDirectory: () => true },
      ]);

      const suggestions = getDirectorySuggestions('../');
      expect(suggestions).toEqual([`../other-project${path.sep}`]);
    });

    it('should ignore hidden directories', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as fs.Stats);
      (fs.readdirSync as Mock).mockReturnValue([
        { name: '.git', isDirectory: () => true },
        { name: 'src', isDirectory: () => true },
      ]);

      const suggestions = getDirectorySuggestions('');
      expect(suggestions).toEqual([`src${path.sep}`]);
    });

    it('should return empty array if directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const suggestions = getDirectorySuggestions('nonexistent/');
      expect(suggestions).toEqual([]);
    });
  });

  describe.skipIf(process.platform !== 'win32')(
    'getDirectorySuggestions (Windows)',
    () => {
      it('should handle %userprofile% expansion', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockReturnValue({
          isDirectory: () => true,
        } as fs.Stats);
        (fs.readdirSync as Mock).mockReturnValue([
          { name: 'Documents', isDirectory: () => true },
          { name: 'Downloads', isDirectory: () => true },
        ]);

        expect(getDirectorySuggestions('%userprofile%\\')).toEqual([
          `%userprofile%\\Documents${path.sep}`,
          `%userprofile%\\Downloads${path.sep}`,
        ]);
        expect(getDirectorySuggestions('%userprofile%\\Doc')).toEqual([
          `%userprofile%\\Documents${path.sep}`,
        ]);
      });
    },
  );
});
