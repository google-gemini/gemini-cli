/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { parseInputForHighlighting } from './highlight.js';

describe('parseInputForHighlighting', () => {
  it('should handle an empty string', () => {
    expect(parseInputForHighlighting('')).toEqual([
      { text: '', type: 'default' },
    ]);
  });

  it('should handle text with no commands or files', () => {
    const text = 'this is a normal sentence';
    expect(parseInputForHighlighting(text)).toEqual([
      { text, type: 'default' },
    ]);
  });

  it('should highlight a single command at the beginning', () => {
    const text = '/help me';
    expect(parseInputForHighlighting(text)).toEqual([
      { text: '/help', type: 'command' },
      { text: ' me', type: 'default' },
    ]);
  });

  it('should highlight a single file path at the beginning', () => {
    const text = '@path/to/file.txt please';
    expect(parseInputForHighlighting(text)).toEqual([
      { text: '@path/to/file.txt', type: 'file' },
      { text: ' please', type: 'default' },
    ]);
  });

  it('should highlight a command in the middle', () => {
    const text = 'I need /help with this';
    expect(parseInputForHighlighting(text)).toEqual([
      { text: 'I need ', type: 'default' },
      { text: '/help', type: 'command' },
      { text: ' with this', type: 'default' },
    ]);
  });

  it('should highlight a file path in the middle', () => {
    const text = 'Please check @path/to/file.txt for details';
    expect(parseInputForHighlighting(text)).toEqual([
      { text: 'Please check ', type: 'default' },
      { text: '@path/to/file.txt', type: 'file' },
      { text: ' for details', type: 'default' },
    ]);
  });

  it('should highlight multiple commands and files', () => {
    const text = 'Use /run with @file.js and also /format @another/file.ts';
    expect(parseInputForHighlighting(text)).toEqual([
      { text: 'Use ', type: 'default' },
      { text: '/run', type: 'command' },
      { text: ' with ', type: 'default' },
      { text: '@file.js', type: 'file' },
      { text: ' and also ', type: 'default' },
      { text: '/format', type: 'command' },
      { text: ' ', type: 'default' },
      { text: '@another/file.ts', type: 'file' },
    ]);
  });

  it('should handle adjacent highlights', () => {
    const text = '/run@file.js';
    expect(parseInputForHighlighting(text)).toEqual([
      { text: '/run', type: 'command' },
      { text: '@file.js', type: 'file' },
    ]);
  });

  it('should handle highlights at the end of the string', () => {
    const text = 'Get help with /help';
    expect(parseInputForHighlighting(text)).toEqual([
      { text: 'Get help with ', type: 'default' },
      { text: '/help', type: 'command' },
    ]);
  });

  it('should handle file paths with dots and dashes', () => {
    const text = 'Check @./path-to/file-name.v2.txt';
    expect(parseInputForHighlighting(text)).toEqual([
      { text: 'Check ', type: 'default' },
      { text: '@./path-to/file-name.v2.txt', type: 'file' },
    ]);
  });

  it('should handle commands with dashes and numbers', () => {
    const text = 'Run /command-123 now';
    expect(parseInputForHighlighting(text)).toEqual([
      { text: 'Run ', type: 'default' },
      { text: '/command-123', type: 'command' },
      { text: ' now', type: 'default' },
    ]);
  });
});
