/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './markdownParser.js';

describe('MarkdownParser', () => {
  it('should parse a simple string with no code', () => {
    const content = 'This is a simple string.';
    const ast = parseMarkdown(content);
    expect(ast).toEqual([{ type: 'text', content }]);
  });

  it('should parse a fenced code block', () => {
    const content = 'Some text\n```typescript\nconst x = 1;\n```\nmore text';
    const ast = parseMarkdown(content);
    expect(ast).toEqual([
      { type: 'text', content: 'Some text\n' },
      {
        type: 'code_block',
        content: '```typescript\nconst x = 1;\n```',
      },
      { type: 'text', content: '\nmore text' },
    ]);
  });

  it('should parse an inline code span', () => {
    const content = 'Some text `const x = 1;` more text';
    const ast = parseMarkdown(content);
    expect(ast).toEqual([
      { type: 'text', content: 'Some text ' },
      { type: 'code_span', content: '`const x = 1;`' },
      { type: 'text', content: ' more text' },
    ]);
  });

  it('should handle multiple code constructs', () => {
    const content = 'Text 1 `code 1` Text 2\n```\ncode 2\n```\nText 3 `code 3`';
    const ast = parseMarkdown(content);
    expect(ast).toEqual([
      { type: 'text', content: 'Text 1 ' },
      { type: 'code_span', content: '`code 1`' },
      { type: 'text', content: ' Text 2\n' },
      { type: 'code_block', content: '```\ncode 2\n```' },
      { type: 'text', content: '\nText 3 ' },
      { type: 'code_span', content: '`code 3`' },
    ]);
  });

  it('should handle content starting with a code block', () => {
    const content = '```\nstart\n```\ntext';
    const ast = parseMarkdown(content);
    expect(ast).toEqual([
      { type: 'code_block', content: '```\nstart\n```' },
      { type: 'text', content: '\ntext' },
    ]);
  });

  it('should handle content ending with a code span', () => {
    const content = 'text `end`';
    const ast = parseMarkdown(content);
    expect(ast).toEqual([
      { type: 'text', content: 'text ' },
      { type: 'code_span', content: '`end`' },
    ]);
  });

  it('should return an empty array for an empty string', () => {
    const content = '';
    const ast = parseMarkdown(content);
    expect(ast).toEqual([]);
  });
});
