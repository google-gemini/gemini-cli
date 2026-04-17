/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  wrapHyperlink,
  looksLikeFilePath,
  extractFilePath,
  resolveFileUri,
  PLAIN_TEXT_FILE_PATH_REGEX,
} from './hyperlinkUtils.js';

describe('hyperlinkUtils', () => {
  describe('wrapHyperlink', () => {
    it('should wrap text with OSC 8 escape sequences', () => {
      const result = wrapHyperlink('Click me', 'https://example.com');
      expect(result).toBe(
        '\x1b]8;;https://example.com\x07Click me\x1b]8;;\x07',
      );
    });

    it('should handle empty text', () => {
      const result = wrapHyperlink('', 'https://example.com');
      expect(result).toBe('\x1b]8;;https://example.com\x07\x1b]8;;\x07');
    });

    it('should handle file:// URIs', () => {
      const result = wrapHyperlink('file.ts', 'file:///home/user/file.ts');
      expect(result).toBe(
        '\x1b]8;;file:///home/user/file.ts\x07file.ts\x1b]8;;\x07',
      );
    });
  });

  describe('looksLikeFilePath', () => {
    it('should detect absolute Unix paths', () => {
      expect(looksLikeFilePath('/home/user/file.ts')).toBe(true);
      expect(looksLikeFilePath('/usr/bin/node')).toBe(true);
    });

    it('should detect relative paths with ./', () => {
      expect(looksLikeFilePath('./src/file.ts')).toBe(true);
      expect(looksLikeFilePath('./file.ts')).toBe(true);
    });

    it('should detect relative paths with ../', () => {
      expect(looksLikeFilePath('../src/file.ts')).toBe(true);
    });

    it('should detect bare relative paths with separators', () => {
      expect(looksLikeFilePath('src/file.ts')).toBe(true);
      expect(looksLikeFilePath('packages/cli/src/index.ts')).toBe(true);
    });

    it('should detect Windows paths', () => {
      expect(looksLikeFilePath('C:\\Users\\file.ts')).toBe(true);
      expect(looksLikeFilePath('C:/Users/file.ts')).toBe(true);
    });

    it('should handle paths with line:col suffix', () => {
      expect(looksLikeFilePath('src/file.ts:42')).toBe(true);
      expect(looksLikeFilePath('src/file.ts:42:10')).toBe(true);
    });

    it('should reject plain words without separators', () => {
      expect(looksLikeFilePath('hello')).toBe(false);
      expect(looksLikeFilePath('world')).toBe(false);
    });

    it('should reject URLs', () => {
      expect(looksLikeFilePath('https://example.com/path')).toBe(false);
      expect(looksLikeFilePath('http://localhost:3000')).toBe(false);
      expect(looksLikeFilePath('file:///path/to/file')).toBe(false);
    });

    it('should reject paths with whitespace', () => {
      expect(looksLikeFilePath('src/ file.ts')).toBe(false);
      expect(looksLikeFilePath('path to/file')).toBe(false);
    });
  });

  describe('extractFilePath', () => {
    it('should return path without line:col suffix', () => {
      expect(extractFilePath('src/file.ts:42')).toBe('src/file.ts');
      expect(extractFilePath('src/file.ts:42:10')).toBe('src/file.ts');
    });

    it('should return path unchanged if no suffix', () => {
      expect(extractFilePath('src/file.ts')).toBe('src/file.ts');
      expect(extractFilePath('/abs/path.js')).toBe('/abs/path.js');
    });
  });

  describe('resolveFileUri', () => {
    it('should resolve absolute paths directly', () => {
      const result = resolveFileUri('/home/user/file.ts');
      expect(result).toBe('file:///home/user/file.ts');
    });

    it('should resolve relative paths against cwd', () => {
      const result = resolveFileUri('src/file.ts', '/workspace/project');
      expect(result).toBe('file:///workspace/project/src/file.ts');
    });

    it('should handle dot-relative paths', () => {
      const result = resolveFileUri('./src/file.ts', '/workspace/project');
      expect(result).toBe('file:///workspace/project/src/file.ts');
    });

    it('should handle parent-relative paths', () => {
      const result = resolveFileUri('../other/file.ts', '/workspace/project');
      expect(result).toBe('file:///workspace/other/file.ts');
    });
  });

  describe('PLAIN_TEXT_FILE_PATH_REGEX', () => {
    beforeEach(() => {
      PLAIN_TEXT_FILE_PATH_REGEX.lastIndex = 0;
    });

    it('should match absolute Unix paths', () => {
      const text = '/home/user/file.ts';
      const match = PLAIN_TEXT_FILE_PATH_REGEX.exec(text);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('/home/user/file.ts');
    });

    it('should match relative paths with ./', () => {
      PLAIN_TEXT_FILE_PATH_REGEX.lastIndex = 0;
      const text = './src/file.ts';
      const match = PLAIN_TEXT_FILE_PATH_REGEX.exec(text);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('./src/file.ts');
    });

    it('should match bare relative paths', () => {
      PLAIN_TEXT_FILE_PATH_REGEX.lastIndex = 0;
      const text = 'src/file.ts';
      const match = PLAIN_TEXT_FILE_PATH_REGEX.exec(text);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('src/file.ts');
    });

    it('should match paths with line numbers', () => {
      PLAIN_TEXT_FILE_PATH_REGEX.lastIndex = 0;
      const text = 'src/file.ts:42';
      const match = PLAIN_TEXT_FILE_PATH_REGEX.exec(text);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('src/file.ts');
      expect(match![2]).toBe('42');
    });

    it('should match paths with line and column numbers', () => {
      PLAIN_TEXT_FILE_PATH_REGEX.lastIndex = 0;
      const text = 'src/file.ts:42:10';
      const match = PLAIN_TEXT_FILE_PATH_REGEX.exec(text);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('src/file.ts');
      expect(match![2]).toBe('42');
      expect(match![3]).toBe('10');
    });
  });
});
