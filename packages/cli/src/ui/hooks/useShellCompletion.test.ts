/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getTokenAtCursor,
  escapeShellPath,
  resolvePathCompletions,
  scanPathExecutables,
} from './useShellCompletion.js';
import type { FileSystemStructure } from '@google/gemini-cli-test-utils';
import { createTmpDir, cleanupTmpDir } from '@google/gemini-cli-test-utils';

describe('useShellCompletion utilities', () => {
  describe('getTokenAtCursor', () => {
    it('should return empty token struct for empty line', () => {
      expect(getTokenAtCursor('', 0)).toEqual({
        token: '',
        start: 0,
        end: 0,
        isFirstToken: true,
        tokens: [''],
        cursorIndex: 0,
        commandToken: '',
      });
    });

    it('should extract the first token at cursor position 0', () => {
      const result = getTokenAtCursor('git status', 3);
      expect(result).toEqual({
        token: 'git',
        start: 0,
        end: 3,
        isFirstToken: true,
        tokens: ['git', 'status'],
        cursorIndex: 0,
        commandToken: 'git',
      });
    });

    it('should extract the second token when cursor is on it', () => {
      const result = getTokenAtCursor('git status', 7);
      expect(result).toEqual({
        token: 'status',
        start: 4,
        end: 10,
        isFirstToken: false,
        tokens: ['git', 'status'],
        cursorIndex: 1,
        commandToken: 'git',
      });
    });

    it('should handle cursor at start of second token', () => {
      const result = getTokenAtCursor('git status', 4);
      expect(result).toEqual({
        token: 'status',
        start: 4,
        end: 10,
        isFirstToken: false,
        tokens: ['git', 'status'],
        cursorIndex: 1,
        commandToken: 'git',
      });
    });

    it('should handle escaped spaces', () => {
      const result = getTokenAtCursor('cat my\\ file.txt', 16);
      expect(result).toEqual({
        token: 'my file.txt',
        start: 4,
        end: 16,
        isFirstToken: false,
        tokens: ['cat', 'my file.txt'],
        cursorIndex: 1,
        commandToken: 'cat',
      });
    });

    it('should handle single-quoted strings', () => {
      const result = getTokenAtCursor("cat 'my file.txt'", 17);
      expect(result).toEqual({
        token: 'my file.txt',
        start: 4,
        end: 17,
        isFirstToken: false,
        tokens: ['cat', 'my file.txt'],
        cursorIndex: 1,
        commandToken: 'cat',
      });
    });

    it('should handle double-quoted strings', () => {
      const result = getTokenAtCursor('cat "my file.txt"', 17);
      expect(result).toEqual({
        token: 'my file.txt',
        start: 4,
        end: 17,
        isFirstToken: false,
        tokens: ['cat', 'my file.txt'],
        cursorIndex: 1,
        commandToken: 'cat',
      });
    });

    it('should handle cursor past all tokens (trailing space)', () => {
      const result = getTokenAtCursor('git ', 4);
      expect(result).toEqual({
        token: '',
        start: 4,
        end: 4,
        isFirstToken: false,
        tokens: ['git', ''],
        cursorIndex: 1,
        commandToken: 'git',
      });
    });

    it('should handle cursor in the middle of a word', () => {
      const result = getTokenAtCursor('git checkout main', 7);
      expect(result).toEqual({
        token: 'checkout',
        start: 4,
        end: 12,
        isFirstToken: false,
        tokens: ['git', 'checkout', 'main'],
        cursorIndex: 1,
        commandToken: 'git',
      });
    });

    it('should mark isFirstToken correctly for first word', () => {
      const result = getTokenAtCursor('gi', 2);
      expect(result?.isFirstToken).toBe(true);
    });

    it('should mark isFirstToken correctly for second word', () => {
      const result = getTokenAtCursor('git sta', 7);
      expect(result?.isFirstToken).toBe(false);
    });

    it('should handle cursor in whitespace between tokens', () => {
      const result = getTokenAtCursor('git  status', 4);
      expect(result).toEqual({
        token: '',
        start: 4,
        end: 4,
        isFirstToken: false,
        tokens: ['git', '', 'status'],
        cursorIndex: 1,
        commandToken: 'git',
      });
    });
  });

  describe('escapeShellPath', () => {
    const isWin = process.platform === 'win32';

    it('should escape spaces', () => {
      expect(escapeShellPath('my file.txt')).toBe(
        isWin ? 'my file.txt' : 'my\\ file.txt',
      );
    });

    it('should escape parentheses', () => {
      expect(escapeShellPath('file (copy).txt')).toBe(
        isWin ? 'file (copy).txt' : 'file\\ \\(copy\\).txt',
      );
    });

    it('should not escape normal characters', () => {
      expect(escapeShellPath('normal-file.txt')).toBe('normal-file.txt');
    });

    it('should escape tabs, newlines, carriage returns, and backslashes', () => {
      if (isWin) {
        expect(escapeShellPath('a\tb')).toBe('a\tb');
        expect(escapeShellPath('a\nb')).toBe('a\nb');
        expect(escapeShellPath('a\rb')).toBe('a\rb');
        expect(escapeShellPath('a\\b')).toBe('a\\b');
      } else {
        expect(escapeShellPath('a\tb')).toBe('a\\\tb');
        expect(escapeShellPath('a\nb')).toBe('a\\\nb');
        expect(escapeShellPath('a\rb')).toBe('a\\\rb');
        expect(escapeShellPath('a\\b')).toBe('a\\\\b');
      }
    });

    it('should handle empty string', () => {
      expect(escapeShellPath('')).toBe('');
    });
  });

  describe('resolvePathCompletions', () => {
    let tmpDir: string;

    afterEach(async () => {
      if (tmpDir) {
        await cleanupTmpDir(tmpDir);
      }
    });

    it('should list directory contents for empty partial', async () => {
      const structure: FileSystemStructure = {
        'file.txt': '',
        subdir: {},
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('', tmpDir);
      const values = results.map((s) => s.label);
      expect(values).toContain('subdir/');
      expect(values).toContain('file.txt');
    });

    it('should filter by prefix', async () => {
      const structure: FileSystemStructure = {
        'abc.txt': '',
        'def.txt': '',
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('a', tmpDir);
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('abc.txt');
    });

    it('should match case-insensitively', async () => {
      const structure: FileSystemStructure = {
        Desktop: {},
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('desk', tmpDir);
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Desktop/');
    });

    it('should append trailing slash to directories', async () => {
      const structure: FileSystemStructure = {
        mydir: {},
        'myfile.txt': '',
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('my', tmpDir);
      const dirSuggestion = results.find((s) => s.label.startsWith('mydir'));
      expect(dirSuggestion?.label).toBe('mydir/');
      expect(dirSuggestion?.description).toBe('directory');
    });

    it('should hide dotfiles by default', async () => {
      const structure: FileSystemStructure = {
        '.hidden': '',
        visible: '',
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('', tmpDir);
      const labels = results.map((s) => s.label);
      expect(labels).not.toContain('.hidden');
      expect(labels).toContain('visible');
    });

    it('should show dotfiles when query starts with a dot', async () => {
      const structure: FileSystemStructure = {
        '.hidden': '',
        '.bashrc': '',
        visible: '',
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('.h', tmpDir);
      const labels = results.map((s) => s.label);
      expect(labels).toContain('.hidden');
    });

    it('should show dotfiles in the current directory when query is exactly "."', async () => {
      const structure: FileSystemStructure = {
        '.hidden': '',
        '.bashrc': '',
        visible: '',
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('.', tmpDir);
      const labels = results.map((s) => s.label);
      expect(labels).toContain('.hidden');
      expect(labels).toContain('.bashrc');
      expect(labels).not.toContain('visible');
    });

    it('should handle dotfile completions within a subdirectory', async () => {
      const structure: FileSystemStructure = {
        subdir: {
          '.secret': '',
          'public.txt': '',
        },
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('subdir/.', tmpDir);
      const labels = results.map((s) => s.label);
      expect(labels).toContain('.secret');
      expect(labels).not.toContain('public.txt');
    });

    it('should strip leading quotes to resolve inner directory contents', async () => {
      const structure: FileSystemStructure = {
        src: {
          'index.ts': '',
        },
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('"src/', tmpDir);
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('index.ts');

      const resultsSingleQuote = await resolvePathCompletions("'src/", tmpDir);
      expect(resultsSingleQuote).toHaveLength(1);
      expect(resultsSingleQuote[0].label).toBe('index.ts');
    });

    it('should properly escape resolutions with spaces inside stripped quote queries', async () => {
      const structure: FileSystemStructure = {
        'Folder With Spaces': {},
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('"Fo', tmpDir);
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe('Folder With Spaces/');
      expect(results[0].value).toBe(escapeShellPath('Folder With Spaces/'));
    });

    it('should return empty array for non-existent directory', async () => {
      const results = await resolvePathCompletions(
        '/nonexistent/path/foo',
        '/tmp',
      );
      expect(results).toEqual([]);
    });

    it('should handle tilde expansion', async () => {
      // Just ensure ~ doesn't throw
      const results = await resolvePathCompletions('~/', '/tmp');
      // We can't assert specific files since it depends on the test runner's home
      expect(Array.isArray(results)).toBe(true);
    });

    it('should escape special characters in results', async () => {
      const isWin = process.platform === 'win32';
      const structure: FileSystemStructure = {
        'my file.txt': '',
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('my', tmpDir);
      expect(results).toHaveLength(1);
      expect(results[0].value).toBe(isWin ? 'my file.txt' : 'my\\ file.txt');
    });

    it('should sort directories before files', async () => {
      const structure: FileSystemStructure = {
        'b-file.txt': '',
        'a-dir': {},
      };
      tmpDir = await createTmpDir(structure);

      const results = await resolvePathCompletions('', tmpDir);
      expect(results[0].description).toBe('directory');
      expect(results[1].description).toBe('file');
    });
  });

  describe('scanPathExecutables', () => {
    it('should return an array of executables', async () => {
      const results = await scanPathExecutables();
      expect(Array.isArray(results)).toBe(true);
      // Very basic sanity check: common commands should be found
      if (process.platform !== 'win32') {
        expect(results).toContain('ls');
      } else {
        expect(results).toContain('dir');
        expect(results).toContain('cls');
        expect(results).toContain('copy');
      }
    });

    it('should support abort signal', async () => {
      const controller = new AbortController();
      controller.abort();
      const results = await scanPathExecutables(controller.signal);
      // May return empty or partial depending on timing
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle empty PATH', async () => {
      vi.stubEnv('PATH', '');
      const results = await scanPathExecutables();
      if (process.platform === 'win32') {
        expect(results.length).toBeGreaterThan(0);
        expect(results).toContain('dir');
      } else {
        expect(results).toEqual([]);
      }
      vi.unstubAllEnvs();
    });
  });
});
