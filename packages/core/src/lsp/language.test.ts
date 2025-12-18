/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getLanguageId,
  isLanguageSupported,
  getSupportedExtensions,
  EXTENSION_TO_LANGUAGE,
} from './language.js';

describe('LSP Language Mapping', () => {
  describe('getLanguageId', () => {
    it.each([
      ['.ts', 'typescript'],
      ['.tsx', 'typescriptreact'],
      ['.js', 'javascript'],
      ['.jsx', 'javascriptreact'],
      ['.mjs', 'javascript'],
      ['.cjs', 'javascript'],
      ['.mts', 'typescript'],
      ['.cts', 'typescript'],
    ])('should return correct language for %s files', (ext, expected) => {
      expect(getLanguageId(`/path/to/file${ext}`)).toBe(expected);
    });

    it('should be case insensitive for extensions', () => {
      expect(getLanguageId('/path/to/FILE.TS')).toBe('typescript');
      expect(getLanguageId('/path/to/FILE.TSX')).toBe('typescriptreact');
    });

    it('should return undefined for unsupported extensions', () => {
      expect(getLanguageId('/path/to/file.py')).toBeUndefined();
      expect(getLanguageId('/path/to/file.go')).toBeUndefined();
    });

    it('should handle files without extensions', () => {
      expect(getLanguageId('/path/to/Makefile')).toBeUndefined();
      expect(getLanguageId('/path/to/.gitignore')).toBeUndefined();
    });

    it('should handle various path formats', () => {
      expect(getLanguageId('/home/user/project/src/Button.tsx')).toBe(
        'typescriptreact',
      );
      expect(getLanguageId('./relative/path/index.ts')).toBe('typescript');
      expect(getLanguageId('simple.js')).toBe('javascript');
    });
  });

  describe('isLanguageSupported', () => {
    it('should return true for all supported extensions', () => {
      const supportedFiles = [
        '/path/to/file.ts',
        '/path/to/file.tsx',
        '/path/to/file.js',
        '/path/to/file.jsx',
        '/path/to/file.mjs',
        '/path/to/file.cjs',
        '/path/to/file.mts',
        '/path/to/file.cts',
      ];
      for (const file of supportedFiles) {
        expect(isLanguageSupported(file)).toBe(true);
      }
    });

    it('should return false for unsupported files', () => {
      expect(isLanguageSupported('/path/to/file.py')).toBe(false);
      expect(isLanguageSupported('/path/to/file.go')).toBe(false);
      expect(isLanguageSupported('/path/to/file.json')).toBe(false);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return all supported extensions with correct format', () => {
      const extensions = getSupportedExtensions();
      const expectedExtensions = Object.keys(EXTENSION_TO_LANGUAGE);

      expect(extensions.sort()).toEqual(expectedExtensions.sort());
      for (const ext of extensions) {
        expect(ext.startsWith('.')).toBe(true);
      }
    });
  });
});
