/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { escapePath, unescapePath } from './paths.js';

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
