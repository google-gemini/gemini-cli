/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import { escapeRegex, buildArgsPatterns, isSafeRegExp } from './utils.js';
import { stableStringify } from './stable-stringify.js';

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
      expect(isSafeRegExp('[')).toBe(false);
      expect(isSafeRegExp('([a-z)')).toBe(false);
      expect(isSafeRegExp('*')).toBe(false);
    });

    it('should return false for long regexes', () => {
      expect(isSafeRegExp('a'.repeat(3000))).toBe(false);
    });

    it('should return false for nested quantifiers (ReDoS heuristic)', () => {
      expect(isSafeRegExp('(a+)+')).toBe(false);
      expect(isSafeRegExp('(a|b)*')).toBe(true);
      expect(isSafeRegExp('(.*)*')).toBe(false);
      expect(isSafeRegExp('([a-z]+)+')).toBe(false);
      expect(isSafeRegExp('(.*)+')).toBe(false);
    });
  });

  describe('buildArgsPatterns', () => {
    it('should return argsPattern if provided and no commandPrefix/regex', () => {
      const result = buildArgsPatterns('my-pattern', undefined, undefined);
      expect(result).toEqual(['my-pattern']);
    });

    it('should build pattern from a single commandPrefix', () => {
      const result = buildArgsPatterns(undefined, 'ls', undefined);
      expect(result).toEqual([
        '\\x00\\"command\\":\\"ls\\b(?:(?:[^"&|;\n\r<>]|\\\\"))*\\"\\x00',
      ]);
    });

    it('should build patterns from an array of commandPrefixes', () => {
      const result = buildArgsPatterns(undefined, ['echo', 'ls'], undefined);
      expect(result).toEqual([
        '\\x00\\"command\\":\\"echo\\b(?:(?:[^"&|;\n\r<>]|\\\\"))*\\"\\x00',
        '\\x00\\"command\\":\\"ls\\b(?:(?:[^"&|;\n\r<>]|\\\\"))*\\"\\x00',
      ]);
    });

    it('should build pattern from commandRegex', () => {
      const result = buildArgsPatterns(undefined, undefined, 'rm -rf .*');
      expect(result).toEqual([
        '\\x00\\"command\\":\\"rm -rf .*(?:(?!&|;\n\r<>)(?:[^"&|;\n\r<>]|\\\\"))*\\"\\x00',
      ]);
    });

    it('should prioritize commandPrefix over commandRegex and argsPattern', () => {
      const result = buildArgsPatterns('raw', 'prefix', 'regex');
      expect(result).toEqual([
        '\\x00\\"command\\":\\"prefix\\b(?:(?:[^"&|;\n\r<>]|\\\\"))*\\"\\x00',
      ]);
    });

    it('should prioritize commandRegex over argsPattern if no commandPrefix', () => {
      const result = buildArgsPatterns('raw', undefined, 'regex');
      expect(result).toEqual([
        '\\x00\\"command\\":\\"regex(?:(?!&|;\n\r<>)(?:[^"&|;\n\r<>]|\\\\"))*\\"\\x00',
      ]);
    });

    it('should escape characters in commandPrefix', () => {
      const result = buildArgsPatterns(undefined, 'git checkout -b', undefined);
      expect(result).toEqual([
        '\\x00\\"command\\":\\"git\\ checkout\\ \\-b\\b(?:(?:[^"&|;\n\r<>]|\\\\"))*\\"\\x00',
      ]);
    });

    it('should correctly escape quotes in commandPrefix', () => {
      const result = buildArgsPatterns(undefined, 'git "fix"', undefined);
      expect(result).toEqual([
        '\\x00\\"command\\":\\"git\\ \\\\\\"fix\\\\\\"(?:(?:[^"&|;\n\r<>]|\\\\"))*\\"\\x00',
      ]);
    });

    it('should handle undefined correctly when no inputs are provided', () => {
      const result = buildArgsPatterns(undefined, undefined, undefined);
      expect(result).toEqual([undefined]);
    });

    it('should match prefixes followed by JSON escaped quotes', () => {
      // Testing the security fix logic: allowing "echo \"foo\""
      const prefix = 'echo ';
      const patterns = buildArgsPatterns(undefined, prefix, undefined);
      const regex = new RegExp(patterns[0]!);

      // Mimic JSON stringified args with null byte boundaries
      const validJsonArgs = stableStringify({ command: 'echo "foo"' });
      expect(regex.test(validJsonArgs)).toBe(true);
    });

    it('should NOT match prefixes followed by raw backslashes (security check)', () => {
      // Testing that we blocked the hole: "echo\foo"
      const prefix = 'echo ';
      const patterns = buildArgsPatterns(undefined, prefix, undefined);
      const regex = new RegExp(patterns[0]!);

      // echo\foo -> {"command":"echo\\foo"}
      const attackJsonArgs = stableStringify({ command: 'echo\\foo' });
      expect(regex.test(attackJsonArgs)).toBe(false);

      // Also validation for "git " matching "git\status"
      const gitPatterns = buildArgsPatterns(undefined, 'git ', undefined);
      const gitRegex = new RegExp(gitPatterns[0]!);
      // git\status -> {"command":"git\\status"}
      const gitAttack = stableStringify({ command: 'git\\status' });
      expect(gitAttack).not.toMatch(gitRegex);
    });

    it('should NOT match chained commands using shell operators (security check)', () => {
      // Testing that we block "git log && rm -rf /" when the prefix is "git log"
      const prefix = 'git log';
      const patterns = buildArgsPatterns(undefined, prefix, undefined);
      const regex = new RegExp(patterns[0]!);

      const attackJsonArgs = stableStringify({
        command: 'git log && rm -rf /',
      });
      expect(regex.test(attackJsonArgs)).toBe(false);

      const semicolonAttack = stableStringify({
        command: 'git log; rm -rf /',
      });
      expect(regex.test(semicolonAttack)).toBe(false);
    });

    describe('sequence matching', () => {
      it('should build pattern from a sequence of tokens', () => {
        const result = buildArgsPatterns(
          undefined,
          [['git', 'log']],
          undefined,
        );
        const regex = new RegExp(result[0]!);

        expect(regex.test(stableStringify({ command: 'git log' }))).toBe(true);
        expect(
          regex.test(stableStringify({ command: 'git log --oneline' })),
        ).toBe(true);
        expect(
          regex.test(stableStringify({ command: 'git --no-pager log' })),
        ).toBe(true);
        expect(regex.test(stableStringify({ command: 'git push' }))).toBe(
          false,
        );
      });

      it('should allow flags and options between tokens', () => {
        const result = buildArgsPatterns(
          undefined,
          [['python3', 'main.py']],
          undefined,
        );
        const regex = new RegExp(result[0]!);

        expect(
          regex.test(stableStringify({ command: 'python3 main.py' })),
        ).toBe(true);
        expect(
          regex.test(stableStringify({ command: 'python3 main.py --help' })),
        ).toBe(true);
        expect(
          regex.test(stableStringify({ command: 'python3 -u main.py' })),
        ).toBe(true);
        expect(
          regex.test(stableStringify({ command: 'python3 other.py' })),
        ).toBe(false);
      });
    });
  });
});
