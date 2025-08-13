/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { escapePath, unescapePath, normalizePath } from './paths.js';

describe('escapePath', () => {
  it('should escape spaces', () => {
    expect(escapePath('my file.txt')).toBe('my\\ file.txt');
  });

  it('should escape tabs', () => {
    expect(escapePath('file\twith\ttabs.txt')).toBe('file\\\twith\\\ttabs.txt');
  });

  it('should escape parentheses', () => {
    expect(escapePath('file(1).txt')).toBe('file\\(1\\).txt');
  });

  it('should escape square brackets', () => {
    expect(escapePath('file[backup].txt')).toBe('file\\[backup\\].txt');
  });

  it('should escape curly braces', () => {
    expect(escapePath('file{temp}.txt')).toBe('file\\{temp\\}.txt');
  });

  it('should escape semicolons', () => {
    expect(escapePath('file;name.txt')).toBe('file\\;name.txt');
  });

  it('should escape ampersands', () => {
    expect(escapePath('file&name.txt')).toBe('file\\&name.txt');
  });

  it('should escape pipes', () => {
    expect(escapePath('file|name.txt')).toBe('file\\|name.txt');
  });

  it('should escape asterisks', () => {
    expect(escapePath('file*.txt')).toBe('file\\*.txt');
  });

  it('should escape question marks', () => {
    expect(escapePath('file?.txt')).toBe('file\\?.txt');
  });

  it('should escape dollar signs', () => {
    expect(escapePath('file$name.txt')).toBe('file\\$name.txt');
  });

  it('should escape backticks', () => {
    expect(escapePath('file`name.txt')).toBe('file\\`name.txt');
  });

  it('should escape single quotes', () => {
    expect(escapePath("file'name.txt")).toBe("file\\'name.txt");
  });

  it('should escape double quotes', () => {
    expect(escapePath('file"name.txt')).toBe('file\\"name.txt');
  });

  it('should escape hash symbols', () => {
    expect(escapePath('file#name.txt')).toBe('file\\#name.txt');
  });

  it('should escape exclamation marks', () => {
    expect(escapePath('file!name.txt')).toBe('file\\!name.txt');
  });

  it('should escape tildes', () => {
    expect(escapePath('file~name.txt')).toBe('file\\~name.txt');
  });

  it('should escape less than and greater than signs', () => {
    expect(escapePath('file<name>.txt')).toBe('file\\<name\\>.txt');
  });

  it('should handle multiple special characters', () => {
    expect(escapePath('my file (backup) [v1.2].txt')).toBe(
      'my\\ file\\ \\(backup\\)\\ \\[v1.2\\].txt',
    );
  });

  it('should not double-escape already escaped characters', () => {
    expect(escapePath('my\\ file.txt')).toBe('my\\ file.txt');
    expect(escapePath('file\\(name\\).txt')).toBe('file\\(name\\).txt');
  });

  it('should handle escaped backslashes correctly', () => {
    // Double backslash (escaped backslash) followed by space should escape the space
    expect(escapePath('path\\\\ file.txt')).toBe('path\\\\\\ file.txt');
    // Triple backslash (escaped backslash + escaping backslash) followed by space should not double-escape
    expect(escapePath('path\\\\\\ file.txt')).toBe('path\\\\\\ file.txt');
    // Quadruple backslash (two escaped backslashes) followed by space should escape the space
    expect(escapePath('path\\\\\\\\ file.txt')).toBe('path\\\\\\\\\\ file.txt');
  });

  it('should handle complex escaped backslash scenarios', () => {
    // Escaped backslash before special character that needs escaping
    expect(escapePath('file\\\\(test).txt')).toBe('file\\\\\\(test\\).txt');
    // Multiple escaped backslashes
    expect(escapePath('path\\\\\\\\with space.txt')).toBe(
      'path\\\\\\\\with\\ space.txt',
    );
  });

  it('should handle paths without special characters', () => {
    expect(escapePath('normalfile.txt')).toBe('normalfile.txt');
    expect(escapePath('path/to/normalfile.txt')).toBe('path/to/normalfile.txt');
  });

  it('should handle complex real-world examples', () => {
    expect(escapePath('My Documents/Project (2024)/file [backup].txt')).toBe(
      'My\\ Documents/Project\\ \\(2024\\)/file\\ \\[backup\\].txt',
    );
    expect(escapePath('file with $special &chars!.txt')).toBe(
      'file\\ with\\ \\$special\\ \\&chars\\!.txt',
    );
  });

  it('should handle empty strings', () => {
    expect(escapePath('')).toBe('');
  });

  it('should handle paths with only special characters', () => {
    expect(escapePath(' ()[]{};&|*?$`\'"#!~<>')).toBe(
      '\\ \\(\\)\\[\\]\\{\\}\\;\\&\\|\\*\\?\\$\\`\\\'\\"\\#\\!\\~\\<\\>',
    );
  });
});

describe('unescapePath', () => {
  it('should unescape spaces', () => {
    expect(unescapePath('my\\ file.txt')).toBe('my file.txt');
  });

  it('should unescape tabs', () => {
    expect(unescapePath('file\\\twith\\\ttabs.txt')).toBe(
      'file\twith\ttabs.txt',
    );
  });

  it('should unescape parentheses', () => {
    expect(unescapePath('file\\(1\\).txt')).toBe('file(1).txt');
  });

  it('should unescape square brackets', () => {
    expect(unescapePath('file\\[backup\\].txt')).toBe('file[backup].txt');
  });

  it('should unescape curly braces', () => {
    expect(unescapePath('file\\{temp\\}.txt')).toBe('file{temp}.txt');
  });

  it('should unescape multiple special characters', () => {
    expect(unescapePath('my\\ file\\ \\(backup\\)\\ \\[v1.2\\].txt')).toBe(
      'my file (backup) [v1.2].txt',
    );
  });

  it('should handle paths without escaped characters', () => {
    expect(unescapePath('normalfile.txt')).toBe('normalfile.txt');
    expect(unescapePath('path/to/normalfile.txt')).toBe(
      'path/to/normalfile.txt',
    );
  });

  it('should handle all special characters', () => {
    expect(
      unescapePath(
        '\\ \\(\\)\\[\\]\\{\\}\\;\\&\\|\\*\\?\\$\\`\\\'\\"\\#\\!\\~\\<\\>',
      ),
    ).toBe(' ()[]{};&|*?$`\'"#!~<>');
  });

  it('should be the inverse of escapePath', () => {
    const testCases = [
      'my file.txt',
      'file(1).txt',
      'file[backup].txt',
      'My Documents/Project (2024)/file [backup].txt',
      'file with $special &chars!.txt',
      ' ()[]{};&|*?$`\'"#!~<>',
      'file\twith\ttabs.txt',
    ];

    testCases.forEach((testCase) => {
      expect(unescapePath(escapePath(testCase))).toBe(testCase);
    });
  });

  it('should handle empty strings', () => {
    expect(unescapePath('')).toBe('');
  });

  it('should not affect backslashes not followed by special characters', () => {
    expect(unescapePath('file\\name.txt')).toBe('file\\name.txt');
    expect(unescapePath('path\\to\\file.txt')).toBe('path\\to\\file.txt');
  });

  it('should handle escaped backslashes in unescaping', () => {
    // Should correctly unescape when there are escaped backslashes
    expect(unescapePath('path\\\\\\ file.txt')).toBe('path\\\\ file.txt');
    expect(unescapePath('path\\\\\\\\\\ file.txt')).toBe(
      'path\\\\\\\\ file.txt',
    );
    expect(unescapePath('file\\\\\\(test\\).txt')).toBe('file\\\\(test).txt');
  });
});

describe('normalizePath', () => {
  it('should convert Windows-style backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\Documents\\file.txt')).toBe(
      'C:/Users/Documents/file.txt',
    );
    expect(normalizePath('path\\to\\file.txt')).toBe('path/to/file.txt');
    expect(normalizePath('\\root\\folder\\subfolder\\')).toBe(
      '/root/folder/subfolder/',
    );
  });

  it('should preserve escaped special characters', () => {
    expect(normalizePath('path\\to\\file\\ with\\ spaces.txt')).toBe(
      'path/to/file\\ with\\ spaces.txt',
    );
    expect(normalizePath('folder\\\\file\\(test\\).txt')).toBe(
      'folder\\\\file\\(test\\).txt',
    );
    expect(normalizePath('path\\\\name\\[backup\\].txt')).toBe(
      'path\\\\name\\[backup\\].txt',
    );
  });

  it('should preserve escaped backslashes', () => {
    expect(normalizePath('path\\\\\\\\file.txt')).toBe('path\\\\\\\\file.txt');
    expect(normalizePath('folder\\\\\\\\\\\\name.txt')).toBe(
      'folder\\\\\\\\\\\\name.txt',
    );
  });

  it('should handle mixed separators correctly', () => {
    expect(normalizePath('C:\\Users/Documents\\file.txt')).toBe(
      'C:/Users/Documents/file.txt',
    );
    expect(normalizePath('path/to\\folder\\file.txt')).toBe(
      'path/to/folder/file.txt',
    );
  });

  it('should preserve escaped shell special characters', () => {
    expect(normalizePath('path\\to\\file\\$name.txt')).toBe(
      'path/to/file\\$name.txt',
    );
    expect(normalizePath('folder\\\\file\\*.txt')).toBe(
      'folder\\\\file\\*.txt',
    );
    expect(normalizePath('path\\\\name\\?.txt')).toBe('path\\\\name\\?.txt');
    expect(normalizePath('folder\\\\file\\&name.txt')).toBe(
      'folder\\\\file\\&name.txt',
    );
    expect(normalizePath('path\\\\file\\|name.txt')).toBe(
      'path\\\\file\\|name.txt',
    );
    expect(normalizePath('folder\\\\file\\;name.txt')).toBe(
      'folder\\\\file\\;name.txt',
    );
    expect(normalizePath('path\\\\file\\{name\\}.txt')).toBe(
      'path\\\\file\\{name\\}.txt',
    );
    expect(normalizePath('folder\\\\file\\#name.txt')).toBe(
      'folder\\\\file\\#name.txt',
    );
    expect(normalizePath('path\\\\file\\!name.txt')).toBe(
      'path\\\\file\\!name.txt',
    );
    expect(normalizePath('folder\\\\file\\~name.txt')).toBe(
      'folder\\\\file\\~name.txt',
    );
    expect(normalizePath('path\\\\file\\<name\\>.txt')).toBe(
      'path\\\\file\\<name\\>.txt',
    );
    expect(normalizePath('folder\\\\file\\`name.txt')).toBe(
      'folder\\\\file\\`name.txt',
    );
    expect(normalizePath("path\\\\file\\'name.txt")).toBe(
      "path\\\\file\\'name.txt",
    );
    expect(normalizePath('folder\\\\file\\"name.txt')).toBe(
      'folder\\\\file\\"name.txt',
    );
  });

  it('should handle complex scenarios with multiple escape sequences', () => {
    expect(
      normalizePath('path\\\\\\\\folder\\ with\\ spaces\\\\file\\(test\\).txt'),
    ).toBe('path\\\\\\\\folder\\ with\\ spaces\\\\file\\(test\\).txt');
    expect(normalizePath('C:\\\\Program\\ Files\\\\App\\[config\\].txt')).toBe(
      'C:\\\\Program\\ Files\\\\App\\[config\\].txt',
    );
  });

  it('should handle edge cases', () => {
    expect(normalizePath('')).toBe('');
    expect(normalizePath('\\')).toBe('/');
    expect(normalizePath('\\\\')).toBe('\\\\');
    expect(normalizePath('\\\\\\')).toBe('\\\\/');
    expect(normalizePath('\\\\\\\\')).toBe('\\\\\\\\');
  });

  it('should handle paths that are already normalized', () => {
    expect(normalizePath('path/to/file.txt')).toBe('path/to/file.txt');
    expect(normalizePath('/root/folder/file.txt')).toBe(
      '/root/folder/file.txt',
    );
    expect(normalizePath('file.txt')).toBe('file.txt');
  });

  it('should handle escaped tabs correctly', () => {
    expect(normalizePath('path\\\\file\\\tname.txt')).toBe(
      'path\\\\file\\\tname.txt',
    );
    expect(normalizePath('folder\\\\name\\\tfile.txt')).toBe(
      'folder\\\\name\\\tfile.txt',
    );
  });

  it('should handle consecutive backslashes followed by special characters', () => {
    expect(normalizePath('path\\\\\\\\file\\ name.txt')).toBe(
      'path\\\\\\\\file\\ name.txt',
    );
    expect(normalizePath('folder\\\\\\\\\\\\name\\*.txt')).toBe(
      'folder\\\\\\\\\\\\name\\*.txt',
    );
  });

  it('should handle real-world Windows paths', () => {
    expect(normalizePath('C:\\Program Files\\MyApp\\config.txt')).toBe(
      'C:/Program Files/MyApp/config.txt',
    );
    expect(
      normalizePath('D:\\Users\\John\\Documents\\My\\ Project\\file.txt'),
    ).toBe('D:/Users/John/Documents/My\\ Project/file.txt');
    expect(normalizePath('\\\\server\\share\\folder\\file.txt')).toBe(
      '\\\\server/share/folder/file.txt',
    );
  });

  it('should handle backslash not followed by anything (end of string)', () => {
    expect(normalizePath('path\\to\\folder\\')).toBe('path/to/folder/');
    expect(normalizePath('file\\')).toBe('file/');
  });
});
