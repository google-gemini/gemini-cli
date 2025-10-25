/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { textOutput } from './textOutput.js';

describe('textOutput', () => {
  let stdoutSpy: vi.SpyInstance;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    textOutput._resetForTesting();
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('write() should call process.stdout.write', () => {
    textOutput.write('hello');
    expect(stdoutSpy).toHaveBeenCalledWith('hello');
  });

  it('write() should not call process.stdout.write for empty strings', () => {
    textOutput.write('');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('writeOnNewLine() should not add a newline if the last char was a newline', () => {
    // Default state starts with a newline
    textOutput.writeOnNewLine('hello');
    expect(stdoutSpy).toHaveBeenCalledWith('hello');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
  });

  it('writeOnNewLine() should add a newline if the last char was not a newline', () => {
    textOutput.write('previous');
    stdoutSpy.mockClear(); // Clear spy from the first write

    textOutput.writeOnNewLine('hello');
    expect(stdoutSpy).toHaveBeenCalledWith('\n');
    expect(stdoutSpy).toHaveBeenCalledWith('hello');
    expect(stdoutSpy).toHaveBeenCalledTimes(2);
  });

  it('writeOnNewLine() with no argument should add a newline if one is missing', () => {
    textOutput.write('hello');
    stdoutSpy.mockClear();

    textOutput.writeOnNewLine();
    expect(stdoutSpy).toHaveBeenCalledWith('\n');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
  });

  it('writeOnNewLine() with no argument should not add a newline if one already exists', () => {
    textOutput.write('hello\n');
    stdoutSpy.mockClear();

    textOutput.writeOnNewLine();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('should handle a sequence of calls correctly', () => {
    textOutput.write('first');
    textOutput.writeOnNewLine('second');
    textOutput.write(' part');
    textOutput.writeOnNewLine(); // ensure newline at the end

    const calls = stdoutSpy.mock.calls.map((call) => call[0]);
    expect(calls).toEqual(['first', '\n', 'second', ' part', '\n']);
  });
});
