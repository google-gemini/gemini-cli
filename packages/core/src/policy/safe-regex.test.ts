/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import toml from '@iarna/toml';
import { SafeRegExp } from './safe-regex.js';
import { stableStringify } from './stable-stringify.js';
import { buildArgsPatterns } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('SafeRegExp', () => {
  describe('compile', () => {
    it('should keep the pattern text as source', () => {
      const regex = SafeRegExp.compile('"command":"(git|npm)');

      expect(regex.source).toBe('"command":"(git|npm)');
      expect(regex.toString()).toBe('"command":"(git|npm)');
    });

    it('should throw an Error that names the problem for a malformed pattern', () => {
      expect(() => SafeRegExp.compile('([a-z)')).toThrow(/missing closing/);
      expect(() => SafeRegExp.compile('git (status|branch')).toThrow(Error);
    });

    it.each([
      ['lookahead', '(?=x)'],
      ['negative lookahead', '"command":"git (?!push)'],
      ['lookbehind', '(?<=x)y'],
      ['negative lookbehind', '(?<!x)y'],
      ['backreference', '(a)\\1'],
    ])('should reject %s', (_name, pattern) => {
      expect(() => SafeRegExp.compile(pattern)).toThrow(Error);
    });
  });

  describe('test', () => {
    it('should match anywhere in the input, like RegExp.prototype.test', () => {
      const regex = SafeRegExp.compile('b+');

      expect(regex.test('abbbc')).toBe(true);
      expect(regex.test('xyz')).toBe(false);
    });

    it('should honor anchors', () => {
      const regex = SafeRegExp.compile('^abc$');

      expect(regex.test('abc')).toBe(true);
      expect(regex.test('xabc')).toBe(false);
      expect(regex.test('abcx')).toBe(false);
    });

    it('should give the same answer on repeated calls', () => {
      const regex = SafeRegExp.compile('a');

      expect([regex.test('a'), regex.test('a'), regex.test('a')]).toEqual([
        true,
        true,
        true,
      ]);
    });

    it('should match the NUL delimiters around top-level properties', () => {
      const regex = SafeRegExp.compile('\\x00"file_path":"[\\w-]+\\.md"\\x00');
      const matches = (args: Record<string, unknown>) =>
        regex.test(stableStringify(args));

      expect(matches({ file_path: 'plan.md', content: 'text' })).toBe(true);
      expect(matches({ file_path: '../plan.md', content: 'text' })).toBe(false);
      // A NUL inside a value is escaped by JSON, so it is not treated as a
      // delimiter.
      expect(
        matches({
          file_path: 'notes.txt',
          content: '\0"file_path":"plan.md"\0',
        }),
      ).toBe(false);
    });
  });

  describe('programSize', () => {
    it('should grow with repetition counts', () => {
      expect(SafeRegExp.compile('abc').programSize).toBeLessThan(10);
      expect(SafeRegExp.compile('.{1000}').programSize).toBeGreaterThan(1000);
      expect(SafeRegExp.compile('.{1000}.{1000}').programSize).toBeGreaterThan(
        2000,
      );
    });
  });

  describe('equality', () => {
    it('should compare equal when the pattern text is the same', () => {
      expect(SafeRegExp.compile('a+b')).toEqual(SafeRegExp.compile('a+b'));
      expect(SafeRegExp.compile('a+b')).not.toEqual(SafeRegExp.compile('a+c'));
    });

    it('should still compare equal after one instance has been used', () => {
      const used = SafeRegExp.compile('(a|b)*a(a|b){8}$');
      used.test('ab'.repeat(500));

      expect(used).toEqual(SafeRegExp.compile('(a|b)*a(a|b){8}$'));
    });
  });

  describe('linear-time matching', () => {
    const repeated = (unit: string) => (size: number) =>
      unit.repeat(size) + '!';

    // `firstSize` is checked before the larger inputs so that a slowdown is
    // reported by an assertion on a short input rather than by a long-running
    // test.
    it.each([
      { pattern: '(a+)+$', input: repeated('a'), firstSize: 26 },
      { pattern: '(a|aa)+$', input: repeated('a'), firstSize: 38 },
      { pattern: '(a|a)+$', input: repeated('a'), firstSize: 26 },
      { pattern: '(\\w|\\d)+$', input: repeated('1'), firstSize: 26 },
      { pattern: '([a-z]+)+$', input: repeated('a'), firstSize: 26 },
      { pattern: '^(a|a?)+$', input: repeated('a'), firstSize: 26 },
    ])(
      'should match the nested quantifier or alternation pattern $pattern in linear time',
      ({ pattern, input, firstSize }) => {
        const regex = SafeRegExp.compile(pattern);
        regex.test('warm-up');

        for (const size of [firstSize, 50, 100_000]) {
          const text = input(size);
          const start = performance.now();
          const matched = regex.test(text);
          const elapsed = performance.now() - start;

          expect(matched).toBe(false);
          expect(elapsed).toBeLessThan(size > 50 ? 1000 : 50);
        }
      },
    );

    it('should scan a large argument in linear time for patterns with wildcards', () => {
      // Each text contains the literals of its pattern in an order that cannot
      // match, so the whole argument is scanned.
      const filler = (size: number) =>
        'The quick brown fox jumps over the lazy dog. '.repeat(
          Math.ceil(size / 45),
        );
      // `firstSizeKb` is checked before the 1 MB input so that a slowdown is
      // reported by an assertion rather than by a long-running test.
      const cases = [
        {
          pattern: '.*first.*second.*',
          content: (size: number) => `second ${filler(size)} first`,
          firstSizeKb: 128,
        },
        {
          pattern: '.*report-.*\\.json.*',
          content: (size: number) => `.json ${filler(size)} report-`,
          firstSizeKb: 128,
        },
        {
          pattern: '(foo|bar).*baz',
          content: (size: number) =>
            `baz ${'foo bar '.repeat(Math.ceil(size / 8))}`,
          firstSizeKb: 256,
        },
      ];

      for (const { pattern, content, firstSizeKb } of cases) {
        const regex = SafeRegExp.compile(pattern);

        for (const sizeKb of [firstSizeKb, 1024]) {
          const args = stableStringify({
            file_path: 'src/index.ts',
            content: content(sizeKb * 1024),
          });
          const start = performance.now();
          const matched = regex.test(args);
          const elapsed = performance.now() - start;

          expect(matched).toBe(false);
          expect(elapsed).toBeLessThan(1000);
        }
      }
    });
  });

  // Policy patterns used to run on RegExp. These checks pin that the patterns
  // shipped with the CLI, and the ones it generates from command prefixes,
  // still match exactly the same arguments on the linear-time engine.
  describe('agreement with the JavaScript engine', () => {
    interface TomlRule {
      argsPattern?: string;
      commandRegex?: string;
      commandPrefix?: string | string[];
    }

    const builtInPatterns = (): string[] => {
      const policiesDir = path.join(__dirname, 'policies');
      const patterns = new Set<string>();
      for (const file of fs.readdirSync(policiesDir)) {
        if (!file.endsWith('.toml')) {
          continue;
        }
        const parsed = toml.parse(
          fs.readFileSync(path.join(policiesDir, file), 'utf-8'),
        ) as { rule?: TomlRule[]; safety_checker?: TomlRule[] };
        const rules = [
          ...(parsed.rule ?? []),
          ...(parsed.safety_checker ?? []),
        ];
        for (const rule of rules) {
          // Prefix rules are covered by the generated-pattern test below.
          if (rule.commandPrefix) {
            continue;
          }
          for (const pattern of buildArgsPatterns(
            rule.argsPattern,
            undefined,
            rule.commandRegex,
          )) {
            if (pattern) {
              patterns.add(pattern);
            }
          }
        }
      }
      return [...patterns];
    };

    it('should match the same arguments for every built-in pattern', () => {
      const filePaths = [
        'plan.md',
        './plan.md',
        'plans/plan.md',
        './plans/plan.md',
        '../plan.md',
        'plans/../x.md',
        'plan.txt',
        'plan.md"',
        '/home/u/.gemini/tmp/abc/plans/plan.md',
        '/home/u/.gemini/tmp/abc/sess-1/plans/my_plan-2.md',
        '.gemini/tmp/abc/plans/p.md',
        './.gemini/tmp/abc/s/plans/p.md',
        'C:\\Users\\u\\.gemini\\tmp\\abc\\plans\\p.md',
        'ユーザー\u3000名/.gemini/tmp/abc/plans/メモ.md',
        'a\u00a0b.md',
        'emoji-😀.md',
        'src/index.ts',
        '',
      ];
      const agentNames = ['codebase_investigator', 'cli_help', 'cli_helper'];
      const corpus = [
        ...filePaths.flatMap((file_path) => [
          stableStringify({ file_path, content: 'text' }),
          stableStringify({ file_path, content: '\0"file_path":"plan.md"\0' }),
          stableStringify({ file_path, old_string: 'a', new_string: 'b' }),
          JSON.stringify({ file_path }),
        ]),
        ...agentNames.flatMap((agent_name) => [
          stableStringify({ agent_name, prompt: 'look around' }),
          JSON.stringify({ agent_name }),
        ]),
      ];
      const patterns = builtInPatterns();

      const differences: string[] = [];
      let matches = 0;
      for (const pattern of patterns) {
        const linear = SafeRegExp.compile(pattern);
        const native = new RegExp(pattern);
        for (const args of corpus) {
          const expected = native.test(args);
          if (expected) {
            matches++;
          }
          if (linear.test(args) !== expected) {
            differences.push(`${pattern} against ${JSON.stringify(args)}`);
          }
        }
      }

      // Guard against a vacuous pass.
      expect(patterns.length).toBeGreaterThan(0);
      expect(matches).toBeGreaterThan(0);
      expect(differences).toEqual([]);
    });

    it('should match the same commands for patterns generated from a prefix', () => {
      // What buildArgsPatterns produced, and how it was compiled, before the
      // switch to the linear-time engine.
      const legacyEscape = (text: string) =>
        text.replace(/[-[\]{}()*+?.,\\^$|#\s"]/g, '\\$&');
      const legacyPrefixPattern = (prefix: string) => {
        const encoded = JSON.stringify(prefix);
        const openQuotePrefix = encoded.substring(0, encoded.length - 1);
        return new RegExp(
          legacyEscape(`"command":${openQuotePrefix}`) + '(?:[\\s"]|\\\\")',
        );
      };

      const prefixes = [
        'git',
        'git status',
        'rm',
        'rm -rf',
        'echo "hi"',
        'git log *.txt',
        'echo $HOME',
        'c:\\tools\\x.exe',
        'grep -E "^foo.*bar$"',
        'echo #tag',
        'echo héllo',
        'echo\u3000全角',
        'git\u00a0push',
        'a|b',
        '[x]',
        'a.b',
      ];
      const suffixes = [
        '',
        ' --flag',
        'x',
        '\u00a0x',
        '\u3000x',
        '\u2028x',
        '\ufeffx',
        '"x',
        '\\x',
        '\tx',
        '\nx',
      ];
      const commands = [
        ...prefixes.flatMap((prefix) =>
          suffixes.map((suffix) => prefix + suffix),
        ),
        'gitstatus',
        'git  status',
        'axb',
        'emoji 😀',
        '',
      ];

      const differences: string[] = [];
      let matches = 0;
      for (const prefix of prefixes) {
        const linear = SafeRegExp.compile(
          buildArgsPatterns(undefined, prefix)[0]!,
        );
        const native = legacyPrefixPattern(prefix);
        for (const command of commands) {
          for (const args of [
            stableStringify({ command }),
            JSON.stringify({ command, dir_path: '/workspace' }),
          ]) {
            const expected = native.test(args);
            if (expected) {
              matches++;
            }
            if (linear.test(args) !== expected) {
              differences.push(`${prefix} against ${JSON.stringify(args)}`);
            }
          }
        }
      }

      expect(matches).toBeGreaterThan(0);
      expect(differences).toEqual([]);
    });
  });
});
