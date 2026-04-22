/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { LineBuffer } from './lineBuffer.js';

describe('LineBuffer', () => {
  it('returns no lines for an empty push', () => {
    const buf = new LineBuffer();
    expect(buf.push('')).toEqual([]);
  });

  it('emits a single LF-terminated line', () => {
    const buf = new LineBuffer();
    expect(buf.push('hello\n')).toEqual(['hello']);
  });

  it('strips trailing CR on CRLF line endings (Windows PTY)', () => {
    const buf = new LineBuffer();
    expect(buf.push('hello\r\nworld\r\n')).toEqual(['hello', 'world']);
  });

  it('emits multiple lines from a single chunk', () => {
    const buf = new LineBuffer();
    expect(buf.push('a\nb\nc\n')).toEqual(['a', 'b', 'c']);
  });

  it('preserves a partial line across chunks', () => {
    const buf = new LineBuffer();
    expect(buf.push('hel')).toEqual([]);
    expect(buf.push('lo\nworld')).toEqual(['hello']);
    expect(buf.push('\n')).toEqual(['world']);
  });

  it('splits a CRLF pair across chunks correctly', () => {
    const buf = new LineBuffer();
    expect(buf.push('hello\r')).toEqual([]);
    expect(buf.push('\nworld\n')).toEqual(['hello', 'world']);
  });

  it('preserves lone CR as part of a line (progress-bar redraw is not a terminator)', () => {
    const buf = new LineBuffer();
    expect(buf.push('progress: 50%\rprogress: 100%\n')).toEqual([
      'progress: 50%\rprogress: 100%',
    ]);
  });

  it('does not emit a line for a lone CR that never sees a newline', () => {
    const buf = new LineBuffer();
    expect(buf.push('progress: 50%\r')).toEqual([]);
  });

  it('flush() returns the buffered partial line', () => {
    const buf = new LineBuffer();
    buf.push('no newline yet');
    expect(buf.flush()).toEqual(['no newline yet']);
    expect(buf.flush()).toEqual([]);
  });

  it('flush() returns [] when the buffer is empty', () => {
    const buf = new LineBuffer();
    expect(buf.flush()).toEqual([]);
  });

  it('flush() strips a trailing CR on the partial line', () => {
    const buf = new LineBuffer();
    buf.push('dangling\r');
    expect(buf.flush()).toEqual(['dangling']);
  });

  it('flush() suppresses an empty partial that is only CR', () => {
    const buf = new LineBuffer();
    buf.push('\r');
    expect(buf.flush()).toEqual([]);
  });

  it('emits a truncated line when a partial line exceeds the size cap', () => {
    const buf = new LineBuffer({ maxLineBytes: 8, truncationMarker: '[T]' });
    const lines = buf.push('0123456789abcdef');
    expect(lines).toEqual(['01234567[T]']);
  });

  it('discards the remainder of an over-sized line until the next newline', () => {
    const buf = new LineBuffer({ maxLineBytes: 4, truncationMarker: '[T]' });
    const first = buf.push('aaaaaXXXXXXXXXX\nnext');
    expect(first).toEqual(['aaaa[T]']);
    expect(buf.push('\n')).toEqual(['next']);
  });

  it('discard state spans chunk boundaries', () => {
    const buf = new LineBuffer({ maxLineBytes: 4, truncationMarker: '[T]' });
    expect(buf.push('aaaaaBBBBBB')).toEqual(['aaaa[T]']);
    expect(buf.push('BBBBBB')).toEqual([]);
    expect(buf.push('\nok\n')).toEqual(['ok']);
  });

  it('handles an empty line between two content lines', () => {
    const buf = new LineBuffer();
    expect(buf.push('a\n\nb\n')).toEqual(['a', '', 'b']);
  });

  it('does not emit a partial line until a newline arrives', () => {
    const buf = new LineBuffer();
    expect(buf.push('still typing')).toEqual([]);
    expect(buf.push(' more')).toEqual([]);
    expect(buf.push(' done\n')).toEqual(['still typing more done']);
  });

  it('flush() after overflow discard cleans state without emitting', () => {
    const buf = new LineBuffer({ maxLineBytes: 8, truncationMarker: '[T]' });
    expect(buf.push('aaaaBBBBCCCC')).toEqual(['aaaaBBBB[T]']);
    expect(buf.flush()).toEqual([]);
    expect(buf.push('next\n')).toEqual(['next']);
  });

  it('truncates a fully-terminated line that exceeds the size cap', () => {
    const buf = new LineBuffer({ maxLineBytes: 4, truncationMarker: '[T]' });
    expect(buf.push('toolongline\n')).toEqual(['tool[T]']);
    expect(buf.push('ok\n')).toEqual(['ok']);
  });
});
