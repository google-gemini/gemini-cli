/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { escapePath, unescapePath, isSubpath, shortenPath } from './paths.js';

describe('escapePath', () => {
  it.each([
    ['spaces', 'my file.txt', 'my\\ file.txt'],
    ['tabs', 'file\twith\ttabs.txt', 'file\\\twith\\\ttabs.txt'],
    ['parentheses', 'file(1).txt', 'file\\(1\\).txt'],
    ['square brackets', 'file[backup].txt', 'file\\[backup\\].txt'],
    ['curly braces', 'file{temp}.txt', 'file\\{temp\\}.txt'],
    ['semicolons', 'file;name.txt', 'file\\;name.txt'],
    ['ampersands', 'file&name.txt', 'file\\&name.txt'],
    ['pipes', 'file|name.txt', 'file\\|name.txt'],
    ['asterisks', 'file*.txt', 'file\\*.txt'],
    ['question marks', 'file?.txt', 'file\\?.txt'],
    ['dollar signs', 'file$name.txt', 'file\\$name.txt'],
    ['backticks', 'file`name.txt', 'file\\`name.txt'],
    ['single quotes', "file'name.txt", "file\\'name.txt"],
    ['double quotes', 'file"name.txt', 'file\\"name.txt'],
    ['hash symbols', 'file#name.txt', 'file\\#name.txt'],
    ['exclamation marks', 'file!name.txt', 'file\\!name.txt'],
    ['tildes', 'file~name.txt', 'file\\~name.txt'],
    [
      'less than and greater than signs',
      'file<name>.txt',
      'file\\<name\\>.txt',
    ],
  ])('should escape %s', (_, input, expected) => {
    expect(escapePath(input)).toBe(expected);
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
  it.each([
    ['spaces', 'my\\ file.txt', 'my file.txt'],
    ['tabs', 'file\\\twith\\\ttabs.txt', 'file\twith\ttabs.txt'],
    ['parentheses', 'file\\(1\\).txt', 'file(1).txt'],
    ['square brackets', 'file\\[backup\\].txt', 'file[backup].txt'],
    ['curly braces', 'file\\{temp\\}.txt', 'file{temp}.txt'],
  ])('should unescape %s', (_, input, expected) => {
    expect(unescapePath(input)).toBe(expected);
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

describe('isSubpath', () => {
  it('should return true for a direct subpath', () => {
    expect(isSubpath('/a/b', '/a/b/c')).toBe(true);
  });

  it('should return true for the same path', () => {
    expect(isSubpath('/a/b', '/a/b')).toBe(true);
  });

  it('should return false for a parent path', () => {
    expect(isSubpath('/a/b/c', '/a/b')).toBe(false);
  });

  it('should return false for a completely different path', () => {
    expect(isSubpath('/a/b', '/x/y')).toBe(false);
  });

  it('should handle relative paths', () => {
    expect(isSubpath('a/b', 'a/b/c')).toBe(true);
    expect(isSubpath('a/b', 'a/c')).toBe(false);
  });

  it('should handle paths with ..', () => {
    expect(isSubpath('/a/b', '/a/b/../b/c')).toBe(true);
    expect(isSubpath('/a/b', '/a/c/../b')).toBe(true);
  });

  it('should handle root paths', () => {
    expect(isSubpath('/', '/a')).toBe(true);
    expect(isSubpath('/a', '/')).toBe(false);
  });

  it('should handle trailing slashes', () => {
    expect(isSubpath('/a/b/', '/a/b/c')).toBe(true);
    expect(isSubpath('/a/b', '/a/b/c/')).toBe(true);
    expect(isSubpath('/a/b/', '/a/b/c/')).toBe(true);
  });
});

describe('isSubpath on Windows', () => {
  const originalPlatform = process.platform;

  beforeAll(() => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    });
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  it('should return true for a direct subpath on Windows', () => {
    expect(isSubpath('C:\\Users\\Test', 'C:\\Users\\Test\\file.txt')).toBe(
      true,
    );
  });

  it('should return true for the same path on Windows', () => {
    expect(isSubpath('C:\\Users\\Test', 'C:\\Users\\Test')).toBe(true);
  });

  it('should return false for a parent path on Windows', () => {
    expect(isSubpath('C:\\Users\\Test\\file.txt', 'C:\\Users\\Test')).toBe(
      false,
    );
  });

  it('should return false for a different drive on Windows', () => {
    expect(isSubpath('C:\\Users\\Test', 'D:\\Users\\Test')).toBe(false);
  });

  it('should be case-insensitive for drive letters on Windows', () => {
    expect(isSubpath('c:\\Users\\Test', 'C:\\Users\\Test\\file.txt')).toBe(
      true,
    );
  });

  it('should be case-insensitive for path components on Windows', () => {
    expect(isSubpath('C:\\Users\\Test', 'c:\\users\\test\\file.txt')).toBe(
      true,
    );
  });

  it('should handle mixed slashes on Windows', () => {
    expect(isSubpath('C:/Users/Test', 'C:\\Users\\Test\\file.txt')).toBe(true);
  });

  it('should handle trailing slashes on Windows', () => {
    expect(isSubpath('C:\\Users\\Test\\', 'C:\\Users\\Test\\file.txt')).toBe(
      true,
    );
  });

  it('should handle relative paths correctly on Windows', () => {
    expect(isSubpath('Users\\Test', 'Users\\Test\\file.txt')).toBe(true);
    expect(isSubpath('Users\\Test\\file.txt', 'Users\\Test')).toBe(false);
  });
});

describe('shortenPath', () => {
  describe.skipIf(process.platform === 'win32')('on POSIX', () => {
    it('should not shorten a path that is shorter than maxLen', () => {
      const p = '/path/to/file.txt';
      expect(shortenPath(p, 40)).toBe(p);
    });

    it('should not shorten a path that is equal to maxLen', () => {
      const p = '/path/to/file.txt';
      expect(shortenPath(p, p.length)).toBe(p);
    });

    it('should shorten a long path, keeping start and end from a short limit', () => {
      const p = '/path/to/a/very/long/directory/name/file.txt';
      expect(shortenPath(p, 25)).toBe('/path/.../name/file.txt');
    });

    it('should shorten a long path, keeping more from the end from a longer limit', () => {
      const p = '/path/to/a/very/long/directory/name/file.txt';
      expect(shortenPath(p, 35)).toBe('/path/.../directory/name/file.txt');
    });

    it('should handle deep paths where few segments from the end fit', () => {
      const p = '/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z/file.txt';
      expect(shortenPath(p, 20)).toBe('/a/.../y/z/file.txt');
    });

    it('should handle deep paths where many segments from the end fit', () => {
      const p = '/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z/file.txt';
      expect(shortenPath(p, 45)).toBe(
        '/a/.../l/m/n/o/p/q/r/s/t/u/v/w/x/y/z/file.txt',
      );
    });

    it('should handle a long filename in the root when it needs shortening', () => {
      const p = '/a-very-long-filename-that-needs-to-be-shortened.txt';
      expect(shortenPath(p, 40)).toBe(
        '/a-very-long-filen...o-be-shortened.txt',
      );
    });

    it('should handle root path', () => {
      const p = '/';
      expect(shortenPath(p, 10)).toBe('/');
    });

    it('should handle a path with one long segment after root', () => {
      const p = '/a-very-long-directory-name';
      expect(shortenPath(p, 20)).toBe('/a-very-...ory-name');
    });

    it('should handle a path with just a long filename (no root)', () => {
      const p = 'a-very-long-filename-that-needs-to-be-shortened.txt';
      expect(shortenPath(p, 40)).toBe(
        'a-very-long-filena...o-be-shortened.txt',
      );
    });

    it('should fallback to truncating earlier segments while keeping the last intact', () => {
      const p = '/abcdef/fghij.txt';
      const result = shortenPath(p, 10);
      expect(result).toBe('/fghij.txt');
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should fallback by truncating start and middle segments when needed', () => {
      const p = '/averylongcomponentname/another/short.txt';
      const result = shortenPath(p, 25);
      expect(result).toBe('/averylo.../.../short.txt');
      expect(result.length).toBeLessThanOrEqual(25);
    });

    it('should show only the last segment when maxLen is tiny', () => {
      const p = '/foo/bar/baz.txt';
      const result = shortenPath(p, 8);
      expect(result).toBe('/baz.txt');
      expect(result.length).toBeLessThanOrEqual(8);
    });

    it('should fall back to simple truncation when the last segment exceeds maxLen', () => {
      const longFile = 'x'.repeat(60) + '.txt';
      const p = `/really/long/${longFile}`;
      const result = shortenPath(p, 50);
      expect(result).toBe('/really/long/xxxxxxxxxx...xxxxxxxxxxxxxxxxxxx.txt');
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should handle relative paths without a root', () => {
      const p = 'foo/bar/baz/qux.txt';
      const result = shortenPath(p, 18);
      expect(result).toBe('foo/.../qux.txt');
      expect(result.length).toBeLessThanOrEqual(18);
    });

    it('should ignore empty segments created by repeated separators', () => {
      const p = '/foo//bar///baz/verylongname.txt';
      const result = shortenPath(p, 20);
      expect(result).toBe('.../verylongname.txt');
      expect(result.length).toBeLessThanOrEqual(20);
    });
  });

  describe.skipIf(process.platform !== 'win32')('on Windows', () => {
    it('should not shorten a path that is shorter than maxLen', () => {
      const p = 'C\\Users\\Test\\file.txt';
      expect(shortenPath(p, 40)).toBe(p);
    });

    it('should not shorten a path that is equal to maxLen', () => {
      const p = 'C\\path\\to\\file.txt';
      expect(shortenPath(p, p.length)).toBe(p);
    });

    it('should shorten a long path, keeping start and end from a short limit', () => {
      const p = 'C\\path\\to\\a\\very\\long\\directory\\name\\file.txt';
      expect(shortenPath(p, 30)).toBe('C\\...\\directory\\name\\file.txt');
    });

    it('should shorten a long path, keeping more from the end from a longer limit', () => {
      const p = 'C\\path\\to\\a\\very\\long\\directory\\name\\file.txt';
      expect(shortenPath(p, 42)).toBe(
        'C\\...\\a\\very\\long\\directory\\name\\file.txt',
      );
    });

    it('should handle deep paths where few segments from the end fit', () => {
      const p =
        'C\\a\\b\\c\\d\\e\\f\\g\\h\\i\\j\\k\\l\\m\\n\\o\\p\\q\\r\\s\\t\\u\\v\\w\\x\\y\\z\\file.txt';
      expect(shortenPath(p, 22)).toBe('C\\...\\w\\x\\y\\z\\file.txt');
    });

    it('should handle deep paths where many segments from the end fit', () => {
      const p =
        'C\\a\\b\\c\\d\\e\\f\\g\\h\\i\\j\\k\\l\\m\\n\\o\\p\\q\\r\\s\\t\\u\\v\\w\\x\\y\\z\\file.txt';
      expect(shortenPath(p, 47)).toBe(
        'C\\...\\k\\l\\m\\n\\o\\p\\q\\r\\s\\t\\u\\v\\w\\x\\y\\z\\file.txt',
      );
    });

    it('should handle a long filename in the root when it needs shortening', () => {
      const p = 'C\\a-very-long-filename-that-needs-to-be-shortened.txt';
      expect(shortenPath(p, 40)).toBe(
        'C\\a-very-long-file...o-be-shortened.txt',
      );
    });

    it('should handle root path', () => {
      const p = 'C\\';
      expect(shortenPath(p, 10)).toBe('C\\');
    });

    it('should handle a path with one long segment after root', () => {
      const p = 'C\\a-very-long-directory-name';
      expect(shortenPath(p, 22)).toBe('C\\a-very-...tory-name');
    });

    it('should handle a path with just a long filename (no root)', () => {
      const p = 'a-very-long-filename-that-needs-to-be-shortened.txt';
      expect(shortenPath(p, 40)).toBe(
        'a-very-long-filena...o-be-shortened.txt',
      );
    });

    it('should fallback to truncating earlier segments while keeping the last intact', () => {
      const p = 'C\\abcdef\\fghij.txt';
      const result = shortenPath(p, 15);
      expect(result).toBe('C\\...\\fghij.txt');
      expect(result.length).toBeLessThanOrEqual(15);
    });

    it('should fallback by truncating start and middle segments when needed', () => {
      const p = 'C\\averylongcomponentname\\another\\short.txt';
      const result = shortenPath(p, 30);
      expect(result).toBe('C\\...\\another\\short.txt');
      expect(result.length).toBeLessThanOrEqual(30);
    });

    it('should show only the last segment for tiny maxLen values', () => {
      const p = 'C\\foo\\bar\\baz.txt';
      const result = shortenPath(p, 12);
      expect(result).toBe('...\\baz.txt');
      expect(result.length).toBeLessThanOrEqual(12);
    });

    it('should keep the drive prefix when space allows', () => {
      const p = 'C\\foo\\bar\\baz.txt';
      const result = shortenPath(p, 14);
      expect(result).toBe('C\\...\\baz.txt');
      expect(result.length).toBeLessThanOrEqual(14);
    });

    it('should fall back when the last segment exceeds maxLen on Windows', () => {
      const longFile = 'x'.repeat(60) + '.txt';
      const p = `C\\really\\long\\${longFile}`;
      const result = shortenPath(p, 40);
      expect(result).toBe('C\\really\\long\\xxxx...xxxxxxxxxxxxxx.txt');
      expect(result.length).toBeLessThanOrEqual(40);
    });

    it('should handle UNC paths with limited space', () => {
      const p = '\\server\\share\\deep\\path\\file.txt';
      const result = shortenPath(p, 25);
      expect(result).toBe('\\server\\...\\path\\file.txt');
      expect(result.length).toBeLessThanOrEqual(25);
    });

    it('should collapse UNC paths further when maxLen shrinks', () => {
      const p = '\\server\\share\\deep\\path\\file.txt';
      const result = shortenPath(p, 18);
      expect(result).toBe('\\s...\\...\\file.txt');
      expect(result.length).toBeLessThanOrEqual(18);
    });
  });
});
