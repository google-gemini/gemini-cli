/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import { resolvePath } from './resolvePath.js';

describe('resolvePath', () => {
  describe('empty and invalid paths', () => {
    it('should return empty string for empty input', () => {
      expect(resolvePath('')).toBe('');
    });
  });

  describe('tilde expansion', () => {
    it('should expand ~ to home directory', () => {
      const result = resolvePath('~');
      expect(result).toBe(os.homedir());
    });

    it('should expand ~/path to home directory plus path', () => {
      const homedir = os.homedir();
      const result = resolvePath('~/documents');
      expect(result).toContain(homedir);
      expect(result).toContain('documents');
    });

    it('should expand ~/path/to/file correctly', () => {
      const homedir = os.homedir();
      const result = resolvePath('~/path/to/file.txt');
      expect(result).toContain(homedir);
      expect(result).toContain('file.txt');
    });

    it('should not expand tilde in the middle of path', () => {
      const result = resolvePath('/home/~user/file');
      expect(result).not.toBe(os.homedir() + 'user/file');
      expect(result).toContain('~user');
    });
  });

  describe('%userprofile% expansion', () => {
    it('should expand %userprofile% to home directory (case-insensitive)', () => {
      const result = resolvePath('%userprofile%');
      expect(result).toBe(os.homedir());
    });

    it('should expand %USERPROFILE% to home directory', () => {
      const result = resolvePath('%USERPROFILE%');
      expect(result).toBe(os.homedir());
    });

    it('should expand %UserProfile% to home directory', () => {
      const result = resolvePath('%UserProfile%');
      expect(result).toBe(os.homedir());
    });

    it('should expand %userprofile%/path correctly', () => {
      const homedir = os.homedir();
      const result = resolvePath('%userprofile%/documents');
      expect(result).toContain(homedir);
      expect(result).toContain('documents');
    });

    it('should expand %USERPROFILE%\\path correctly', () => {
      const homedir = os.homedir();
      const result = resolvePath('%USERPROFILE%\\documents');
      expect(result).toContain(homedir);
      expect(result).toContain('documents');
    });
  });

  describe('path normalization', () => {
    it('should normalize regular paths', () => {
      const result = resolvePath('/path/to/../file');
      expect(result).not.toContain('..');
    });

    it('should normalize paths with multiple slashes', () => {
      const result = resolvePath('/path//to///file');
      expect(result).not.toContain('//');
    });

    it('should handle absolute paths without modification', () => {
      const result = resolvePath('/absolute/path');
      expect(result).toContain('absolute');
      expect(result).toContain('path');
    });

    it('should handle relative paths', () => {
      const result = resolvePath('relative/path');
      expect(result).toBe('relative/path');
    });

    it('should normalize backslashes on Windows-style paths', () => {
      const result = resolvePath('C:\\Users\\test\\file.txt');
      // Path normalization will handle backslashes according to platform
      expect(result).toContain('file.txt');
    });
  });

  describe('complex scenarios', () => {
    it('should handle tilde with normalization', () => {
      const homedir = os.homedir();
      const result = resolvePath('~/path/../other');
      expect(result).toContain(homedir);
      expect(result).not.toContain('..');
    });

    it('should handle %userprofile% with normalization', () => {
      const homedir = os.homedir();
      const result = resolvePath('%userprofile%/path/../other');
      expect(result).toContain(homedir);
      expect(result).not.toContain('..');
    });

    it('should handle paths with trailing slashes', () => {
      const result = resolvePath('~/path/');
      expect(result).toContain(os.homedir());
    });

    it('should handle paths with leading/trailing whitespace after expansion', () => {
      const result = resolvePath('~/documents');
      expect(result).not.toMatch(/^\s/);
      expect(result).not.toMatch(/\s$/);
    });
  });

  describe('edge cases', () => {
    it('should handle just a filename', () => {
      const result = resolvePath('file.txt');
      expect(result).toBe('file.txt');
    });

    it('should handle paths with dots', () => {
      const result = resolvePath('./current/path');
      expect(result).toBe('current/path');
    });

    it('should handle current directory marker', () => {
      const result = resolvePath('.');
      expect(result).toBe('.');
    });

    it('should handle parent directory marker', () => {
      const result = resolvePath('..');
      expect(result).toBe('..');
    });
  });
});
