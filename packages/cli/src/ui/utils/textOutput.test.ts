/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest/globals" />

import type { MockInstance } from 'vitest';
import { vi } from 'vitest';
import { TextOutput } from './textOutput.js';

describe('TextOutput', () => {
  let stdoutSpy: MockInstance<typeof process.stdout.write>;
  let textOutput: TextOutput;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    textOutput = new TextOutput();
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  const getWrittenOutput = () => stdoutSpy.mock.calls.map((c) => c[0]).join('');

  it('write() should call process.stdout.write', () => {
    textOutput.write('hello');
    expect(stdoutSpy).toHaveBeenCalledWith('hello');
  });

  it('write() should not call process.stdout.write for empty strings', () => {
    textOutput.write('');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('writeOnNewLine() should not add a newline if the last char was a newline', () => {
    // Default state starts at the beginning of a line
    textOutput.writeOnNewLine('hello');
    expect(getWrittenOutput()).toBe('hello');
  });

  it('writeOnNewLine() should add a newline if the last char was not a newline', () => {
    textOutput.write('previous');
    textOutput.writeOnNewLine('hello');
    expect(getWrittenOutput()).toBe('previous\nhello');
  });

  it('ensureTrailingNewline() should add a newline if one is missing', () => {
    textOutput.write('hello');
    textOutput.ensureTrailingNewline();
    expect(getWrittenOutput()).toBe('hello\n');
  });

  it('ensureTrailingNewline() should not add a newline if one already exists', () => {
    textOutput.write('hello\n');
    textOutput.ensureTrailingNewline();
    expect(getWrittenOutput()).toBe('hello\n');
  });

  it('should handle a sequence of calls correctly', () => {
    textOutput.write('first');
    textOutput.writeOnNewLine('second');
    textOutput.write(' part');
    textOutput.ensureTrailingNewline();
    textOutput.ensureTrailingNewline(); // second call should do nothing
    textOutput.write('third');

    expect(getWrittenOutput()).toMatchSnapshot();
  });

  it('should correctly handle ANSI escape codes when determining line breaks', () => {
    const blue = (s: string) => `\u001b[34m${s}\u001b[39m`;
    const bold = (s: string) => `\u001b[1m${s}\u001b[22m`;

    textOutput.write(blue('hello'));
    textOutput.writeOnNewLine(bold('world'));
    textOutput.write(blue('\n'));
    textOutput.writeOnNewLine('next');

    expect(getWrittenOutput()).toMatchSnapshot();
  });

  it('should handle empty strings with ANSI codes', () => {
    textOutput.write('hello');
    textOutput.write('\u001b[34m\u001b[39m'); // Empty blue string
    textOutput.writeOnNewLine('world');
    expect(getWrittenOutput()).toMatchSnapshot();
  });

  it('should handle ANSI codes that do not end with a newline', () => {
    textOutput.write('hello\u001b[34m');
    textOutput.writeOnNewLine('world');
    expect(getWrittenOutput()).toMatchSnapshot();
  });
});
