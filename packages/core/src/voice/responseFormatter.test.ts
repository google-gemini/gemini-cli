/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatForSpeech } from './responseFormatter.js';

describe('formatForSpeech', () => {
  describe('edge cases', () => {
    it('should return empty string for empty input', () => {
      expect(formatForSpeech('')).toBe('');
    });

    it('should return plain text unchanged', () => {
      expect(formatForSpeech('Hello world')).toBe('Hello world');
    });
  });

  describe('ANSI escape codes', () => {
    it('should strip color codes', () => {
      expect(formatForSpeech('\x1b[31mError\x1b[0m')).toBe('Error');
    });

    it('should strip bold/dim codes', () => {
      expect(formatForSpeech('\x1b[1mBold\x1b[22m text')).toBe('Bold text');
    });

    it('should strip cursor movement codes', () => {
      expect(formatForSpeech('line1\x1b[2Kline2')).toBe('line1line2');
    });
  });

  describe('markdown stripping', () => {
    it('should strip bold markers **text**', () => {
      expect(formatForSpeech('**Error**: something went wrong')).toBe(
        'Error: something went wrong',
      );
    });

    it('should strip bold markers __text__', () => {
      expect(formatForSpeech('__Error__: something')).toBe('Error: something');
    });

    it('should strip italic markers *text*', () => {
      expect(formatForSpeech('*note*: pay attention')).toBe(
        'note: pay attention',
      );
    });

    it('should strip inline code backticks', () => {
      expect(formatForSpeech('Run `npm install` first')).toBe(
        'Run npm install first',
      );
    });

    it('should strip blockquote prefix', () => {
      expect(formatForSpeech('> This is a quote')).toBe('This is a quote');
    });

    it('should strip heading markers', () => {
      expect(formatForSpeech('# Results\n## Details')).toBe('Results\nDetails');
    });

    it('should replace markdown links with link text', () => {
      expect(formatForSpeech('[Gemini API](https://ai.google.dev)')).toBe(
        'Gemini API',
      );
    });

    it('should strip unordered list markers', () => {
      expect(formatForSpeech('- item one\n- item two')).toBe(
        'item one\nitem two',
      );
    });

    it('should strip ordered list markers', () => {
      expect(formatForSpeech('1. first\n2. second')).toBe('first\nsecond');
    });
  });

  describe('fenced code blocks', () => {
    it('should unwrap a plain code block', () => {
      expect(formatForSpeech('```\nconsole.log("hi")\n```')).toBe(
        'console.log("hi")',
      );
    });

    it('should unwrap a language-tagged code block', () => {
      expect(formatForSpeech('```typescript\nconst x = 1;\n```')).toBe(
        'const x = 1;',
      );
    });

    it('should summarise a JSON object code block above threshold', () => {
      const json = JSON.stringify({ status: 'ok', count: 42, items: [] });
      // Pass jsonThreshold lower than the json string length (38 chars)
      const result = formatForSpeech(`\`\`\`json\n${json}\n\`\`\``, {
        jsonThreshold: 10,
      });
      expect(result).toBe('(JSON object with 3 keys)');
    });

    it('should summarise a JSON array code block above threshold', () => {
      const json = JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      // Pass jsonThreshold lower than the json string length (23 chars)
      const result = formatForSpeech(`\`\`\`\n${json}\n\`\`\``, {
        jsonThreshold: 10,
      });
      expect(result).toBe('(JSON array with 10 items)');
    });

    it('should summarise a large JSON object using default threshold', () => {
      // Build a JSON object whose stringified form exceeds the default 80-char threshold
      const big = {
        status: 'success',
        count: 42,
        items: ['alpha', 'beta', 'gamma'],
        meta: { page: 1, totalPages: 10 },
        timestamp: '2026-03-03T00:00:00Z',
      };
      const json = JSON.stringify(big);
      expect(json.length).toBeGreaterThan(80);
      const result = formatForSpeech(`\`\`\`json\n${json}\n\`\`\``);
      expect(result).toBe('(JSON object with 5 keys)');
    });

    it('should not summarise a tiny JSON value', () => {
      // Below the default 80-char threshold → keep as-is
      const result = formatForSpeech('```json\n{"a":1}\n```', {
        jsonThreshold: 80,
      });
      expect(result).toBe('{"a":1}');
    });
  });

  describe('path abbreviation', () => {
    it('should abbreviate a deep Unix path (default depth 3)', () => {
      const result = formatForSpeech(
        'at /home/user/project/packages/core/src/tools/file.ts',
      );
      expect(result).toContain('\u2026/src/tools/file.ts');
      expect(result).not.toContain('/home/user/project');
    });

    it('should convert :line suffix to "line N"', () => {
      const result = formatForSpeech(
        'Error at /home/user/project/src/tools/file.ts:142',
      );
      expect(result).toContain('line 142');
    });

    it('should drop column from :line:col suffix', () => {
      const result = formatForSpeech(
        'Error at /home/user/project/src/tools/file.ts:142:7',
      );
      expect(result).toContain('line 142');
      expect(result).not.toContain(':7');
    });

    it('should respect custom pathDepth option', () => {
      const result = formatForSpeech(
        '/home/user/project/packages/core/src/file.ts',
        { pathDepth: 2 },
      );
      expect(result).toContain('\u2026/src/file.ts');
    });

    it('should not abbreviate a short path within depth', () => {
      const result = formatForSpeech('/src/file.ts', { pathDepth: 3 });
      // Only 2 segments — no abbreviation needed
      expect(result).toBe('/src/file.ts');
    });

    it('should abbreviate a Windows path on a non-C drive', () => {
      const result = formatForSpeech(
        'D:\\Users\\project\\packages\\core\\src\\file.ts',
        { pathDepth: 3 },
      );
      expect(result).toContain('\u2026/core/src/file.ts');
      expect(result).not.toContain('D:\\Users\\project');
    });

    it('should convert :line on a Windows path on a non-C drive', () => {
      const result = formatForSpeech(
        'Error at D:\\Users\\project\\src\\tools\\file.ts:55',
      );
      expect(result).toContain('line 55');
      expect(result).not.toContain('D:\\Users\\project');
    });

    it('should abbreviate a Unix path containing a scoped npm package segment', () => {
      const result = formatForSpeech(
        'at /home/user/project/node_modules/@google/gemini-cli-core/src/index.ts:12:3',
        { pathDepth: 5 },
      );
      expect(result).toContain('line 12');
      expect(result).not.toContain(':3');
      expect(result).toContain('@google');
    });
  });

  describe('stack trace collapsing', () => {
    it('should collapse a multi-frame stack trace', () => {
      const trace = [
        'Error: ENOENT',
        '    at Object.open (/project/src/file.ts:10:5)',
        '    at Module._load (/project/node_modules/loader.js:20:3)',
        '    at Function.Module._load (/project/node_modules/loader.js:30:3)',
      ].join('\n');

      const result = formatForSpeech(trace);
      expect(result).toContain('and 2 more frames');
      expect(result).not.toContain('Module._load');
    });

    it('should not collapse a single stack frame', () => {
      const trace =
        'Error: ENOENT\n    at Object.open (/project/src/file.ts:10:5)';
      const result = formatForSpeech(trace);
      expect(result).not.toContain('more frames');
    });

    it('should preserve surrounding text when collapsing a stack trace', () => {
      const input = [
        'Operation failed.',
        '    at Object.open (/project/src/file.ts:10:5)',
        '    at Module._load (/project/node_modules/loader.js:20:3)',
        '    at Function.load (/project/node_modules/loader.js:30:3)',
        'Please try again.',
      ].join('\n');

      const result = formatForSpeech(input);
      expect(result).toContain('Operation failed.');
      expect(result).toContain('Please try again.');
      expect(result).toContain('and 2 more frames');
    });
  });

  describe('truncation', () => {
    it('should truncate output longer than maxLength', () => {
      const long = 'word '.repeat(200);
      const result = formatForSpeech(long, { maxLength: 50 });
      expect(result.length).toBeLessThanOrEqual(
        50 + '\u2026 (1000 chars total)'.length,
      );
      expect(result).toContain('\u2026');
      expect(result).toContain('chars total');
    });

    it('should not truncate output within maxLength', () => {
      const short = 'Hello world';
      expect(formatForSpeech(short, { maxLength: 500 })).toBe('Hello world');
    });
  });

  describe('whitespace normalisation', () => {
    it('should collapse more than two consecutive blank lines', () => {
      const result = formatForSpeech('para1\n\n\n\n\npara2');
      expect(result).toBe('para1\n\npara2');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(formatForSpeech('  hello  ')).toBe('hello');
    });
  });

  describe('real-world examples', () => {
    it('should clean an ENOENT error with markdown and path', () => {
      const input =
        '**Error**: `ENOENT: no such file or directory`\n> at /home/user/project/packages/core/src/tools/file-utils.ts:142:7';
      const result = formatForSpeech(input);
      expect(result).not.toContain('**');
      expect(result).not.toContain('`');
      expect(result).not.toContain('>');
      expect(result).toContain('Error');
      expect(result).toContain('ENOENT');
      expect(result).toContain('line 142');
    });

    it('should clean a heading + list response', () => {
      const input = '# Results\n- item one\n- item two\n- item three';
      const result = formatForSpeech(input);
      expect(result).toBe('Results\nitem one\nitem two\nitem three');
    });
  });
});
