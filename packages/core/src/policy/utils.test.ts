/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import {
  escapeRegex,
  buildArgsPatterns,
  isSafeRegExp,
  compileArgsPattern,
  COMMAND_PREFIX_BOUNDARY,
  MAX_PROGRAM_SIZE,
} from './utils.js';
import { SafeRegExp } from './safe-regex.js';
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

    it('should escape ASCII whitespace', () => {
      expect(escapeRegex('a b\tc\nd')).toBe('a\\ b\\\tc\\\nd');
    });

    it('should leave non-ASCII whitespace unescaped', () => {
      // The linear-time engine rejects a backslash in front of a non-ASCII
      // character, and these characters are plain literals in every dialect.
      const input = 'a\u00a0b\u3000c\u2028d\ufeffe';
      expect(escapeRegex(input)).toBe(input);
    });

    it('should produce a pattern that matches exactly the original text', () => {
      const ascii = Array.from({ length: 128 }, (_, code) =>
        String.fromCharCode(code),
      );
      const samples = [
        ...ascii,
        ascii.join(''),
        'C:\\Users\\me\\a b.txt',
        'weird(1)[2]{3}+*?.^$|#,.txt',
        'ユーザー\u3000名/メモ.md',
        'non\u00a0breaking',
        'line\u2028separator',
        'emoji 😀',
      ];

      const failures = samples.filter((sample) => {
        const regex = SafeRegExp.compile(`^${escapeRegex(sample)}$`);
        return !regex.test(sample) || regex.test(`${sample}x`);
      });

      expect(failures).toEqual([]);
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

    it('should return false for syntax the linear-time engine does not support', () => {
      expect(isSafeRegExp('"command":"git (?!push)')).toBe(false);
      expect(isSafeRegExp('(?<=a)b')).toBe(false);
      expect(isSafeRegExp('(a)\\1')).toBe(false);
    });

    it('should flag nested quantifiers exactly as the JavaScript heuristic did', () => {
      // The heuristic used to be this RegExp. It now runs on the linear-time
      // engine and must classify patterns the same way, including where
      // JavaScript's `.` stops at a line terminator.
      const legacyHeuristic = /\([^)]*[*+?{].*\)[*+?{]/;
      const patterns = [
        'abc',
        '(abc)*',
        '(a|b)+',
        '(a+)+',
        '(.*)*',
        '([a-z]+)+',
        '(a|aa)+$',
        '(?:foo|bar)+',
        '(a+) (b)+',
        '(a+)\r(b)+',
        '(a+)\n(b)+',
        '(a+)\u2028(b)+',
        '(a+)\u2029(b)+',
        '\\(a*',
        'x{2}(y)?',
        '"command":"(git|npm)',
        '\\x00"file_path":"[^\\"]+\\.md"\\x00',
        '(a{2})',
        '(a{2}){3}',
        '(a?)b',
        '(a)?',
        '[(*](x)+',
      ];

      const differences = patterns.filter(
        (pattern) => isSafeRegExp(pattern) === legacyHeuristic.test(pattern),
      );

      expect(differences).toEqual([]);
    });
  });

  describe('compileArgsPattern', () => {
    it('should compile a valid pattern with the linear-time engine', () => {
      const result = compileArgsPattern('"command":"(git|npm)');

      expect(result).toEqual({
        ok: true,
        regex: SafeRegExp.compile('"command":"(git|npm)'),
      });
      expect(result.ok && result.regex.test('{"command":"git status"}')).toBe(
        true,
      );
      expect(result.ok && result.regex.test('{"command":"ls"}')).toBe(false);
    });

    it('should report a malformed pattern as invalid, with the engine error', () => {
      expect(compileArgsPattern('([a-z)')).toEqual({
        ok: false,
        reason: 'invalid',
        error: expect.stringContaining('missing closing'),
      });
    });

    it('should report unsupported syntax as invalid', () => {
      const unsupported = [
        '(?=x)', // lookahead
        '(?!x)', // negative lookahead
        '(?<=x)y', // lookbehind
        '(?<!x)y', // negative lookbehind
        '(a)\\1', // backreference
        '\\u00e9', // JavaScript-only escape
        'a{1001}', // repetition count above the engine limit
      ];

      const accepted = unsupported.filter(
        (pattern) => compileArgsPattern(pattern).ok,
      );

      expect(accepted).toEqual([]);
      expect(compileArgsPattern('(?!x)')).toMatchObject({
        ok: false,
        reason: 'invalid',
      });
    });

    it('should report an overly long pattern as restricted', () => {
      expect(compileArgsPattern('a'.repeat(1998)).ok).toBe(true);
      expect(compileArgsPattern('a'.repeat(2049))).toEqual({
        ok: false,
        reason: 'restricted',
      });
      // The length limit applies before compilation, so it wins over syntax.
      expect(compileArgsPattern('('.repeat(3000))).toEqual({
        ok: false,
        reason: 'restricted',
      });
    });

    it('should report nested quantifiers as restricted', () => {
      expect(compileArgsPattern('(a+)+$')).toEqual({
        ok: false,
        reason: 'restricted',
      });
    });

    it('should run the nested-quantifier check on the authored pattern', () => {
      expect(
        compileArgsPattern(
          '\\x00"command":"(?:npm run (test|lint)?)',
          'npm run (test|lint)?',
        ).ok,
      ).toBe(true);
      expect(compileArgsPattern('(a+)+')).toEqual({
        ok: false,
        reason: 'restricted',
      });
    });

    it('should report a pattern that compiles beyond the size limit', () => {
      // Repetition counts multiply the compiled size of a pattern.
      expect(MAX_PROGRAM_SIZE).toBe(2000);
      expect(compileArgsPattern('.{1000}').ok).toBe(true);
      expect(compileArgsPattern('.{999}.{999}').ok).toBe(true);
      expect(compileArgsPattern('.{1000}.{1000}')).toEqual({
        ok: false,
        reason: 'too_large',
        programSize: 2002,
      });
      expect(compileArgsPattern('(a|b|c){1000}')).toMatchObject({
        ok: false,
        reason: 'too_large',
      });
      expect(isSafeRegExp('.{1000}.{1000}')).toBe(false);
    });

    it('should keep ordinary patterns far below the size limit', () => {
      const patterns = [
        '"command":"(git|npm)',
        '\\x00"file_path":"[^\\"]+[\\\\/]+plans[\\\\/]+[\\w-]+\\.md"\\x00',
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
        buildArgsPatterns(undefined, 'git status --short')[0]!,
      ];

      const sizes = patterns.map(
        (pattern) => SafeRegExp.compile(pattern).programSize,
      );

      expect(Math.max(...sizes)).toBeLessThan(200);
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
        '\\x00\\"command\\":\\"ls' + COMMAND_PREFIX_BOUNDARY,
      ]);
    });

    it('should build patterns from an array of commandPrefixes', () => {
      const result = buildArgsPatterns(undefined, ['echo', 'ls'], undefined);
      expect(result).toEqual([
        '\\x00\\"command\\":\\"echo' + COMMAND_PREFIX_BOUNDARY,
        '\\x00\\"command\\":\\"ls' + COMMAND_PREFIX_BOUNDARY,
      ]);
    });

    it('should build pattern from commandRegex', () => {
      const result = buildArgsPatterns(undefined, undefined, 'rm -rf .*');
      expect(result).toEqual(['\\x00"command":"(?:rm -rf .*)']);
    });

    it('should prioritize commandPrefix over commandRegex and argsPattern', () => {
      const result = buildArgsPatterns('raw', 'prefix', 'regex');
      expect(result).toEqual([
        '\\x00\\"command\\":\\"prefix' + COMMAND_PREFIX_BOUNDARY,
      ]);
    });

    it('should prioritize commandRegex over argsPattern if no commandPrefix', () => {
      const result = buildArgsPatterns('raw', undefined, 'regex');
      expect(result).toEqual(['\\x00"command":"(?:regex)']);
    });

    it('should escape characters in commandPrefix', () => {
      const result = buildArgsPatterns(undefined, 'git checkout -b', undefined);
      expect(result).toEqual([
        '\\x00\\"command\\":\\"git\\ checkout\\ \\-b' + COMMAND_PREFIX_BOUNDARY,
      ]);
    });

    it('should correctly escape quotes in commandPrefix', () => {
      const result = buildArgsPatterns(undefined, 'git "fix"', undefined);
      expect(result).toEqual([
        // eslint-disable-next-line no-useless-escape
        '\\x00\\\"command\\\":\\\"git\\ \\\\\\\"fix\\\\\\\"' +
          COMMAND_PREFIX_BOUNDARY,
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
      const regex = SafeRegExp.compile(patterns[0]!);

      // Mimic stableStringify output
      // echo "foo" -> {\0"command":"echo \"foo\""\0}
      const validJsonArgs = stableStringify({ command: 'echo "foo"' });
      expect(regex.test(validJsonArgs)).toBe(true);
    });

    it('should NOT match prefixes followed by raw backslashes (security check)', () => {
      // Testing that we blocked the hole: "echo\foo"
      const prefix = 'echo ';
      const patterns = buildArgsPatterns(undefined, prefix, undefined);
      const regex = SafeRegExp.compile(patterns[0]!);

      // echo\foo -> {\0"command":"echo\\foo"\0}
      // In regex matching: "echo " is followed by "\" which is NOT in [\s"] and is not \"
      const backslashArgs = stableStringify({ command: 'echo\\foo' });
      expect(regex.test(backslashArgs)).toBe(false);

      // Also validation for "git " matching "git\status"
      const gitPatterns = buildArgsPatterns(undefined, 'git ', undefined);
      const gitRegex = SafeRegExp.compile(gitPatterns[0]!);
      // git\status -> {\0"command":"git\\status"\0}
      const gitBackslashArgs = stableStringify({ command: 'git\\status' });
      expect(gitRegex.test(gitBackslashArgs)).toBe(false);
    });

    it('should pin the text that may follow a command prefix', () => {
      expect(COMMAND_PREFIX_BOUNDARY).toBe(
        String.raw`(?:[\s\x0b\x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}"]|\\")`,
      );
    });

    it('should accept the same characters after a prefix as the JavaScript pattern did', () => {
      // Prefix patterns were written for JavaScript's Unicode-aware `\s`. The
      // linear-time engine's `\s` is ASCII-only, so the pattern spells the set
      // out. For example, a rule on "rm" must keep matching "rm<U+00A0>-rf".
      const regex = SafeRegExp.compile(buildArgsPatterns(undefined, 'rm')[0]!);
      const legacy = new RegExp('\\x00' + /"command":"rm(?:[\s"]|\\")/.source);

      const differences: string[] = [];
      for (let code = 0; code <= 0xffff; code++) {
        // Lone surrogates cannot appear in JSON text.
        if (code >= 0xd800 && code <= 0xdfff) {
          continue;
        }
        const args = stableStringify({
          command: `rm${String.fromCharCode(code)}-rf x`,
        });
        if (regex.test(args) !== legacy.test(args)) {
          differences.push(`U+${code.toString(16).padStart(4, '0')}`);
        }
      }

      expect(differences).toEqual([]);
    });

    it('should end a prefix at whitespace or a quote, but not at a backslash', () => {
      const regex = SafeRegExp.compile(buildArgsPatterns(undefined, 'git')[0]!);
      const matches = (command: string) =>
        regex.test(stableStringify({ command }));

      expect(matches('git')).toBe(true);
      expect(matches('git status')).toBe(true);
      expect(matches('git\u00a0status')).toBe(true);
      expect(matches('git\u3000status')).toBe(true);
      expect(matches('git"status')).toBe(true);
      expect(matches('gitstatus')).toBe(false);
      expect(matches('git\\status')).toBe(false);
    });

    const nestedCommandArgs = [
      {
        command: 'touch /tmp/gcli_policy_marker',
        extra: { command: 'git status' },
      },
      {
        command: 'touch /tmp/gcli_policy_marker',
        extra: [{ command: 'git status' }],
      },
      {
        command: 'touch /tmp/gcli_policy_marker',
        description: '"command":"git status"',
      },
    ];

    it('should anchor commandPrefix patterns to the top-level command argument', () => {
      const regex = SafeRegExp.compile(buildArgsPatterns(undefined, 'git')[0]!);

      expect(regex.test(stableStringify({ command: 'git status' }))).toBe(true);
      expect(
        regex.test(
          stableStringify({
            command: 'git status',
            description: 'Show status',
            dir_path: '.',
          }),
        ),
      ).toBe(true);
      for (const args of nestedCommandArgs) {
        expect(regex.test(stableStringify(args))).toBe(false);
      }
    });

    it('should anchor commandRegex patterns to the top-level command argument', () => {
      const regex = SafeRegExp.compile(
        buildArgsPatterns(undefined, undefined, 'git (status|log)')[0]!,
      );

      expect(regex.test(stableStringify({ command: 'git status' }))).toBe(true);
      expect(
        regex.test(
          stableStringify({
            command: 'git status',
            description: 'Show status',
            dir_path: '.',
          }),
        ),
      ).toBe(true);
      for (const args of nestedCommandArgs) {
        expect(regex.test(stableStringify(args))).toBe(false);
      }
    });

    it('should apply commandRegex alternation to the top-level command argument only', () => {
      const regex = SafeRegExp.compile(
        buildArgsPatterns(undefined, undefined, 'ls|pwd')[0]!,
      );

      expect(regex.test(stableStringify({ command: 'pwd' }))).toBe(true);
      expect(
        regex.test(
          stableStringify({
            command: 'touch /tmp/gcli_policy_marker',
            description: 'print pwd',
          }),
        ),
      ).toBe(false);
    });
  });
});
