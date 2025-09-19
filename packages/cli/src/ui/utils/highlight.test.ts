/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseInputForHighlighting } from './highlight.js';

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
