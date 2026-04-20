/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  stripAnsiCodes,
  replaceSymbols,
  stripInlineMarkdown,
  formatCodeBlock,
  convertBulletsToNumbered,
  convertTableToText,
  convertHeadings,
  convertHorizontalRules,
  formatForSpeech,
} from './speechFormatter.js';

describe('speechFormatter', () => {
  describe('stripAnsiCodes', () => {
    it('should remove ANSI color codes', () => {
      const input = '\x1b[31mred text\x1b[0m';
      expect(stripAnsiCodes(input)).toBe('red text');
    });

    it('should return plain text unchanged', () => {
      expect(stripAnsiCodes('hello world')).toBe('hello world');
    });

    it('should handle multiple ANSI sequences', () => {
      const input = '\x1b[1m\x1b[34mbold blue\x1b[0m normal';
      expect(stripAnsiCodes(input)).toBe('bold blue normal');
    });
  });

  describe('replaceSymbols', () => {
    it('should replace arrow symbol', () => {
      expect(replaceSymbols('go \u2192 here')).toBe('go  arrow  here');
    });

    it('should replace check mark', () => {
      expect(replaceSymbols('done \u2713')).toBe('done  check ');
    });

    it('should replace multiple symbols', () => {
      expect(replaceSymbols('\u2713 yes \u2717 no')).toBe(
        ' check  yes  cross  no',
      );
    });

    it('should leave text without symbols unchanged', () => {
      expect(replaceSymbols('plain text')).toBe('plain text');
    });

    it('should replace emoji-style symbols', () => {
      expect(replaceSymbols('\u2705 passed')).toBe(' check  passed');
      expect(replaceSymbols('\u274C failed')).toBe(' error  failed');
    });
  });

  describe('stripInlineMarkdown', () => {
    it('should strip bold markers', () => {
      expect(stripInlineMarkdown('**bold text**')).toBe('bold text');
    });

    it('should strip italic markers', () => {
      expect(stripInlineMarkdown('*italic*')).toBe('italic');
    });

    it('should strip strikethrough markers', () => {
      expect(stripInlineMarkdown('~~deleted~~')).toBe('deleted');
    });

    it('should strip inline code backticks', () => {
      expect(stripInlineMarkdown('use `npm install`')).toBe('use npm install');
    });

    it('should convert markdown links to text with URL', () => {
      expect(stripInlineMarkdown('[Google](https://google.com)')).toBe(
        'Google (https://google.com)',
      );
    });

    it('should strip underline tags', () => {
      expect(stripInlineMarkdown('<u>underlined</u>')).toBe('underlined');
    });

    it('should strip bold+italic markers', () => {
      expect(stripInlineMarkdown('***bold italic***')).toBe('bold italic');
    });

    it('should handle multiple formatting in one line', () => {
      expect(stripInlineMarkdown('**bold** and *italic* and `code`')).toBe(
        'bold and italic and code',
      );
    });
  });

  describe('formatCodeBlock', () => {
    it('should format code block with language', () => {
      const result = formatCodeBlock(['console.log("hi");'], 'javascript');
      expect(result).toBe('Code, javascript:\nconsole.log("hi");\nEnd code.');
    });

    it('should format code block without language', () => {
      const result = formatCodeBlock(['echo hello'], null);
      expect(result).toBe('Code:\necho hello\nEnd code.');
    });

    it('should handle multi-line code blocks', () => {
      const result = formatCodeBlock(
        ['def greet():', '    print("hello")'],
        'python',
      );
      expect(result).toBe(
        'Code, python:\ndef greet():\n    print("hello")\nEnd code.',
      );
    });

    it('should handle empty code blocks', () => {
      const result = formatCodeBlock([''], null);
      expect(result).toBe('Code:\n\nEnd code.');
    });
  });

  describe('convertBulletsToNumbered', () => {
    it('should convert dash bullets to numbered items', () => {
      const input = '- first\n- second\n- third';
      expect(convertBulletsToNumbered(input)).toBe(
        '1. first\n2. second\n3. third',
      );
    });

    it('should convert asterisk bullets to numbered items', () => {
      const input = '* first\n* second';
      expect(convertBulletsToNumbered(input)).toBe('1. first\n2. second');
    });

    it('should convert plus bullets to numbered items', () => {
      const input = '+ first\n+ second';
      expect(convertBulletsToNumbered(input)).toBe('1. first\n2. second');
    });

    it('should handle nested bullets as sub-items', () => {
      const input = '- parent\n  - child\n  - child2\n- next';
      expect(convertBulletsToNumbered(input)).toBe(
        '1. parent\n  sub-item: child\n  sub-item: child2\n2. next',
      );
    });

    it('should reset numbering after blank line', () => {
      const input = '- a\n- b\n\n- c\n- d';
      expect(convertBulletsToNumbered(input)).toBe('1. a\n2. b\n\n1. c\n2. d');
    });

    it('should leave non-bullet lines unchanged', () => {
      const input = 'regular text\n- bullet';
      expect(convertBulletsToNumbered(input)).toBe('regular text\n1. bullet');
    });
  });

  describe('convertTableToText', () => {
    it('should linearize a simple table', () => {
      const headers = ['Name', 'Age'];
      const rows = [
        ['Alice', '30'],
        ['Bob', '25'],
      ];
      const result = convertTableToText(headers, rows);
      expect(result).toBe(
        'Table with 2 columns: Name, Age.\n' +
          'Row 1: Name: Alice, Age: 30.\n' +
          'Row 2: Name: Bob, Age: 25.\n' +
          'End table.',
      );
    });

    it('should handle single-column table', () => {
      const headers = ['Item'];
      const rows = [['apple'], ['banana']];
      const result = convertTableToText(headers, rows);
      expect(result).toContain('Table with 1 column: Item.');
    });

    it('should handle missing cell values', () => {
      const headers = ['A', 'B'];
      const rows = [['only-a']];
      const result = convertTableToText(headers, rows);
      expect(result).toContain('Row 1: A: only-a, B: .');
    });
  });

  describe('convertHeadings', () => {
    it('should convert h1 headings', () => {
      expect(convertHeadings('# Title')).toBe('Heading level 1: Title');
    });

    it('should convert h2 headings', () => {
      expect(convertHeadings('## Section')).toBe('Heading level 2: Section');
    });

    it('should convert h3 headings', () => {
      expect(convertHeadings('### Subsection')).toBe(
        'Heading level 3: Subsection',
      );
    });

    it('should convert h4 headings', () => {
      expect(convertHeadings('#### Detail')).toBe('Heading level 4: Detail');
    });

    it('should leave non-heading lines unchanged', () => {
      expect(convertHeadings('regular text')).toBe('regular text');
    });

    it('should handle multiple headings', () => {
      const input = '# First\nsome text\n## Second';
      expect(convertHeadings(input)).toBe(
        'Heading level 1: First\nsome text\nHeading level 2: Second',
      );
    });
  });

  describe('convertHorizontalRules', () => {
    it('should convert --- to separator', () => {
      expect(convertHorizontalRules('---')).toBe('Separator.');
    });

    it('should convert *** to separator', () => {
      expect(convertHorizontalRules('***')).toBe('Separator.');
    });

    it('should convert ___ to separator', () => {
      expect(convertHorizontalRules('___')).toBe('Separator.');
    });

    it('should leave non-hr lines unchanged', () => {
      expect(convertHorizontalRules('some text')).toBe('some text');
    });
  });

  describe('formatForSpeech (integration)', () => {
    it('should process a full markdown response', () => {
      const input = [
        '## Getting Started',
        '',
        'Install the package with `npm install`:',
        '',
        '```bash',
        'npm install my-package',
        '```',
        '',
        '- Step one',
        '- Step two',
        '- Step three',
      ].join('\n');

      const result = formatForSpeech(input);

      expect(result).toContain('Heading level 2: Getting Started');
      expect(result).toContain('Install the package with npm install:');
      expect(result).toContain('Code, bash:');
      expect(result).toContain('npm install my-package');
      expect(result).toContain('End code.');
      expect(result).toContain('1. Step one');
      expect(result).toContain('2. Step two');
      expect(result).toContain('3. Step three');
      // Markdown syntax should be gone
      expect(result).not.toContain('##');
      expect(result).not.toContain('```');
      expect(result).not.toContain('`npm');
    });

    it('should handle ANSI codes in the input', () => {
      const input = '\x1b[1m**bold**\x1b[0m and \u2192 arrow';
      const result = formatForSpeech(input);
      expect(result).toBe('bold and  arrow  arrow');
    });

    it('should process markdown tables', () => {
      const input = [
        '| Name  | Value |',
        '| ----- | ----- |',
        '| alpha | 1     |',
        '| beta  | 2     |',
      ].join('\n');

      const result = formatForSpeech(input);
      expect(result).toContain('Table with 2 columns: Name, Value.');
      expect(result).toContain('Row 1: Name: alpha, Value: 1.');
      expect(result).toContain('End table.');
    });

    it('should collapse excessive blank lines', () => {
      const input = 'line1\n\n\n\n\nline2';
      const result = formatForSpeech(input);
      expect(result).toBe('line1\n\nline2');
    });

    it('should handle empty input', () => {
      expect(formatForSpeech('')).toBe('');
    });

    it('should handle plain text without markdown', () => {
      const input = 'This is just a regular sentence.';
      expect(formatForSpeech(input)).toBe('This is just a regular sentence.');
    });
  });
});
