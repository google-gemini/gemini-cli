/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseInputForHighlighting,
  findPlaceholderCandidates,
} from './parse.js';

describe('parseInputForHighlighting', () => {
  it('should handle an empty string', () => {
    expect(parseInputForHighlighting('', 0)).toEqual([
      { text: '', type: 'default' },
    ]);
  });

  it('should handle text with no commands or files', () => {
    const text = 'this is a normal sentence';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text, type: 'default' },
    ]);
  });

  it('should highlight a single command at the beginning when index is 0', () => {
    const text = '/help me';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text: '/help', type: 'command' },
      { text: ' me', type: 'default' },
    ]);
  });

  it('should NOT highlight a command at the beginning when index is not 0', () => {
    const text = '/help me';
    expect(parseInputForHighlighting(text, 1)).toEqual([
      { text: '/help', type: 'default' },
      { text: ' me', type: 'default' },
    ]);
  });

  it('should highlight a single file path at the beginning', () => {
    const text = '@path/to/file.txt please';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text: '@path/to/file.txt', type: 'file' },
      { text: ' please', type: 'default' },
    ]);
  });

  it('should not highlight a command in the middle', () => {
    const text = 'I need /help with this';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text: 'I need /help with this', type: 'default' },
    ]);
  });

  it('should highlight a file path in the middle', () => {
    const text = 'Please check @path/to/file.txt for details';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text: 'Please check ', type: 'default' },
      { text: '@path/to/file.txt', type: 'file' },
      { text: ' for details', type: 'default' },
    ]);
  });

  it('should highlight files but not commands not at the start', () => {
    const text = 'Use /run with @file.js and also /format @another/file.ts';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text: 'Use /run with ', type: 'default' },
      { text: '@file.js', type: 'file' },
      { text: ' and also /format ', type: 'default' },
      { text: '@another/file.ts', type: 'file' },
    ]);
  });

  it('should handle adjacent highlights at start', () => {
    const text = '/run@file.js';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text: '/run', type: 'command' },
      { text: '@file.js', type: 'file' },
    ]);
  });

  it('should not highlight command at the end of the string', () => {
    const text = 'Get help with /help';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text: 'Get help with /help', type: 'default' },
    ]);
  });

  it('should handle file paths with dots and dashes', () => {
    const text = 'Check @./path-to/file-name.v2.txt';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text: 'Check ', type: 'default' },
      { text: '@./path-to/file-name.v2.txt', type: 'file' },
    ]);
  });

  it('should not highlight command with dashes and numbers not at start', () => {
    const text = 'Run /command-123 now';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text: 'Run /command-123 now', type: 'default' },
    ]);
  });

  it('should highlight command with dashes and numbers at start', () => {
    const text = '/command-123 now';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text: '/command-123', type: 'command' },
      { text: ' now', type: 'default' },
    ]);
  });

  it('should still highlight a file path on a non-zero line', () => {
    const text = 'some text @path/to/file.txt';
    expect(parseInputForHighlighting(text, 1)).toEqual([
      { text: 'some text ', type: 'default' },
      { text: '@path/to/file.txt', type: 'file' },
    ]);
  });

  it('should not highlight command but highlight file on a non-zero line', () => {
    const text = '/cmd @file.txt';
    expect(parseInputForHighlighting(text, 2)).toEqual([
      { text: '/cmd', type: 'default' },
      { text: ' ', type: 'default' },
      { text: '@file.txt', type: 'file' },
    ]);
  });

  it('should highlight a file path with escaped spaces', () => {
    const text = 'cat @/my\\ path/file.txt';
    expect(parseInputForHighlighting(text, 0)).toEqual([
      { text: 'cat ', type: 'default' },
      { text: '@/my\\ path/file.txt', type: 'file' },
    ]);
  });
});

describe('findPlaceholderCandidates', () => {
  it('matches a single known placeholder and returns range', () => {
    const text = 'abc[ENV]def';
    const set = new Set(['[ENV]']);
    const ranges = findPlaceholderCandidates(text, set);
    expect(ranges).toEqual([{ start: 3, end: 8, text: '[ENV]' }]);
  });

  it('does not match unknown placeholder', () => {
    const text = 'abc[ENV]def';
    const set = new Set(['[OTHER]']);
    const ranges = findPlaceholderCandidates(text, set);
    expect(ranges).toEqual([]);
  });

  it('matches adjacent placeholders', () => {
    const text = '[A][B]';
    const set = new Set(['[A]', '[B]']);
    const ranges = findPlaceholderCandidates(text, set);
    expect(ranges).toEqual([
      { start: 0, end: 3, text: '[A]' },
      { start: 3, end: 6, text: '[B]' },
    ]);
  });

  it('matches inner placeholder inside nested brackets', () => {
    const text = 'x[ENV[REG]]y';
    const set = new Set(['[ENV]', '[REG]']);
    const ranges = findPlaceholderCandidates(text, set);
    expect(ranges).toEqual([{ start: 5, end: 10, text: '[REG]' }]);
  });

  it('does not match unclosed square bracket', () => {
    const text = 'foo[ENV';
    const set = new Set(['[ENV]']);
    const ranges = findPlaceholderCandidates(text, set);
    expect(ranges).toEqual([]);
  });
});

describe('parseInputForHighlighting with placeholders', () => {
  it('highlights a single placeholder', () => {
    const text = 'Deploy to [ENV] today';
    const tokens = parseInputForHighlighting(text, 0, ['[ENV]']);
    expect(tokens).toEqual([
      { text: 'Deploy to ', type: 'default' },
      { text: '[ENV]', type: 'placeholder' },
      { text: ' today', type: 'default' },
    ]);
  });

  it('highlights multiple placeholders alternating with text', () => {
    const text = 'A [X] and [Y].';
    const tokens = parseInputForHighlighting(text, 0, ['[X]', '[Y]']);
    expect(tokens).toEqual([
      { text: 'A ', type: 'default' },
      { text: '[X]', type: 'placeholder' },
      { text: ' and ', type: 'default' },
      { text: '[Y]', type: 'placeholder' },
      { text: '.', type: 'default' },
    ]);
  });

  it('highlights adjacent placeholders', () => {
    const text = '[A][B]';
    const tokens = parseInputForHighlighting(text, 0, ['[A]', '[B]']);
    expect(tokens).toEqual([
      { text: '[A]', type: 'placeholder' },
      { text: '[B]', type: 'placeholder' },
    ]);
  });

  it('does not highlight unknown placeholders', () => {
    const text = 'Use [ENV]';
    const tokens = parseInputForHighlighting(text, 0, ['[OTHER]']);
    expect(tokens).toEqual([{ text: 'Use [ENV]', type: 'default' }]);
  });

  it('mixes with command and file while preserving types', () => {
    const text = '/run [ARG] @file.txt';
    const tokens = parseInputForHighlighting(text, 0, ['[ARG]']);
    expect(tokens).toEqual([
      { text: '/run', type: 'command' },
      { text: ' ', type: 'default' },
      { text: '[ARG]', type: 'placeholder' },
      { text: ' ', type: 'default' },
      { text: '@file.txt', type: 'file' },
    ]);
  });

  it('non-zero index: command not highlighted; placeholder and file are', () => {
    const text = '/cmd [ARG] @f';
    const tokens = parseInputForHighlighting(text, 2, ['[ARG]']);
    expect(tokens).toEqual([
      { text: '/cmd', type: 'default' },
      { text: ' ', type: 'default' },
      { text: '[ARG]', type: 'placeholder' },
      { text: ' ', type: 'default' },
      { text: '@f', type: 'file' },
    ]);
  });

  it('highlights inner placeholder; does not highlight unclosed', () => {
    expect(
      parseInputForHighlighting('x[ENV[REG]]y', 0, [
        '[ENV[REG]]',
        '[ENV]',
        '[REG]',
      ]),
    ).toEqual([
      { text: 'x[ENV', type: 'default' },
      { text: '[REG]', type: 'placeholder' },
      { text: ']y', type: 'default' },
    ]);
    expect(parseInputForHighlighting('foo[ENV', 0, ['[ENV]'])).toEqual([
      { text: 'foo[ENV', type: 'default' },
    ]);
  });
});
