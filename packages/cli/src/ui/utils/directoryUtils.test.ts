/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect } from 'vitest';
import { expandHomeDir } from './directoryUtils.js';
import type * as osActual from 'node:os';
import * as path from 'node:path';

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
});
