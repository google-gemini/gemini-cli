/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { escapeRegex, buildArgsPatterns, isSafeRegExp } from './utils.js';

describe('policy/utils', () => {
  describe('escapeRegex', () => {
    it('should escape special regex characters', () => {
      const input = '.-*+?^${}()|[]\\ "';
      const escaped = escapeRegex(input);
      expect(escaped).toBe(
        '\\.\\-\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\\\ \\"',
      );
    });

    it('should return the same string if no special characters are present', () => {
      const input = 'abcABC123';
      expect(escapeRegex(input)).toBe(input);
    });
  });

  describe('isSafeRegExp', () => {
    it('should return true for simple regexes', () => {
      expect(isSafeRegExp('abc')).toBe(true);
      expect(isSafeRegExp('^abc$')).toBe(true);
      expect(isSafeRegExp('a|b')).toBe(true);
    });

    it('should return true for safe quantifiers', () => {
      expect(isSafeRegExp('a+')).toBe(true);
      expect(isSafeRegExp('a*')).toBe(true);
      expect(isSafeRegExp('a?')).toBe(true);
      expect(isSafeRegExp('a{1,3}')).toBe(true);
    });

    it('should return true for safe groups', () => {
      expect(isSafeRegExp('(abc)*')).toBe(true);
      expect(isSafeRegExp('(a|b)+')).toBe(true);
    });

    it('should return false for invalid regexes', () => {
      expect(isSafeRegExp('([a-z)')).toBe(false);
      expect(isSafeRegExp('*')).toBe(false);
    });

    it('should return false for extremely long regexes', () => {
      expect(isSafeRegExp('a'.repeat(2049))).toBe(false);
    });

    it('should return false for nested quantifiers (potential ReDoS)', () => {
      expect(isSafeRegExp('(a+)+')).toBe(false);
      expect(isSafeRegExp('(a+)*')).toBe(false);
      expect(isSafeRegExp('(a*)+')).toBe(false);
      expect(isSafeRegExp('(a*)*')).toBe(false);
      expect(isSafeRegExp('(a|b+)+')).toBe(false);
      expect(isSafeRegExp('(.*)+')).toBe(false);
    });
  });

  describe('buildArgsPatterns', () => {
    it('should return argsPattern if provided and no commandPrefix/regex', () => {
      const result = buildArgsPatterns('my-pattern', undefined, undefined);
      expect(result).toEqual([{ pattern: 'my-pattern' }]);
    });

    it('should build pattern from a single commandPrefix', () => {
      const result = buildArgsPatterns(undefined, 'ls', undefined);
      expect(result).toEqual([{ pattern: '^ls(?:\\s|$)', argName: 'command' }]);
    });

    it('should build patterns from an array of commandPrefixes', () => {
      const result = buildArgsPatterns(undefined, ['ls', 'cd'], undefined);
      expect(result).toEqual([
        { pattern: '^ls(?:\\s|$)', argName: 'command' },
        { pattern: '^cd(?:\\s|$)', argName: 'command' },
      ]);
    });

    it('should build pattern from commandRegex', () => {
      const result = buildArgsPatterns(undefined, undefined, 'rm -rf .*');
      expect(result).toEqual([{ pattern: 'rm -rf .*', argName: 'command' }]);
    });

    it('should prioritize commandPrefix over commandRegex and argsPattern', () => {
      const result = buildArgsPatterns('raw', 'prefix', 'regex');
      expect(result).toEqual([
        { pattern: '^prefix(?:\\s|$)', argName: 'command' },
      ]);
    });

    it('should prioritize commandRegex over argsPattern if no commandPrefix', () => {
      const result = buildArgsPatterns('raw', undefined, 'regex');
      expect(result).toEqual([{ pattern: 'regex', argName: 'command' }]);
    });

    it('should escape characters in commandPrefix', () => {
      const result = buildArgsPatterns(undefined, 'git checkout -b', undefined);
      expect(result).toEqual([
        { pattern: '^git\\ checkout\\ \\-b(?:\\s|$)', argName: 'command' },
      ]);
    });

    it('should correctly escape special characters in commandPrefix', () => {
      const result = buildArgsPatterns(undefined, 'git*', undefined);
      expect(result).toEqual([
        { pattern: '^git\\*(?:\\s|$)', argName: 'command' },
      ]);
    });

    it('should handle undefined correctly when no inputs are provided', () => {
      const result = buildArgsPatterns(undefined, undefined, undefined);
      expect(result).toEqual([{ pattern: undefined }]);
    });

    it('should match prefixes correctly', () => {
      const prefix = 'echo ';
      const patterns = buildArgsPatterns(undefined, prefix, undefined);
      expect(patterns[0].argName).toBe('command');
      const regex = new RegExp(patterns[0].pattern!);

      expect(regex.test('echo hello')).toBe(true);
      expect(regex.test('echo')).toBe(true);
      expect(regex.test('echonop')).toBe(false);
    });

    describe('commandRegex anchors', () => {
      it('should transform ^ anchor correctly', () => {
        const patterns = buildArgsPatterns(undefined, undefined, '^git status');
        expect(patterns[0].argName).toBe('command');
        const regex = new RegExp(patterns[0].pattern!);
        // We match against the command string directly now
        const command = 'git status';
        expect(regex.test(command)).toBe(true);
      });

      it('should transform $ anchor correctly', () => {
        const patterns = buildArgsPatterns(
          undefined,
          undefined,
          'tmux send-keys -t [a-z0-9:]+ (C-c|Up|Enter|Up Enter)$',
        );
        expect(patterns[0].argName).toBe('command');
        const regex = new RegExp(patterns[0].pattern!);
        const command = 'tmux send-keys -t superpowers:6 C-c';
        expect(regex.test(command)).toBe(true);
      });

      it('should handle $ anchor correctly', () => {
        const patterns = buildArgsPatterns(undefined, undefined, 'git status$');
        expect(patterns[0].argName).toBe('command');
        const regex = new RegExp(patterns[0].pattern!);
        const command = 'git status';
        expect(regex.test(command)).toBe(true);
      });

      it('should NOT match if $ anchor is used and more text follows in command', () => {
        const patterns = buildArgsPatterns(undefined, undefined, 'git status$');
        const regex = new RegExp(patterns[0].pattern!);
        const command = 'git status --porcelain';
        expect(regex.test(command)).toBe(false);
      });

      it('should handle escaped anchors as literals', () => {
        const patterns = buildArgsPatterns(
          undefined,
          undefined,
          'git status\\$',
        );
        const regex = new RegExp(patterns[0].pattern!);
        // Literal $ in command: git status$
        const command = 'git status$';
        expect(regex.test(command)).toBe(true);
      });
    });
  });
});
