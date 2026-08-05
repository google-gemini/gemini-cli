/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { parseToolCallArguments } from './toolArguments.js';

describe('parseToolCallArguments', () => {
  it('parses a JSON object string', () => {
    expect(parseToolCallArguments('write_file', '{"path":"a.txt"}')).toEqual({
      args: { path: 'a.txt' },
    });
  });

  it('reports an error instead of throwing on malformed JSON', () => {
    const { args, error } = parseToolCallArguments(
      'write_file',
      '{"unterminated":',
    );

    expect(args).toEqual({});
    expect(error).toContain('Failed to parse JSON arguments');
    expect(error).toContain('write_file');
    // The offending text is echoed so the model can see what it produced.
    expect(error).toContain('{"unterminated":');
  });

  it.each([
    ['array', '[1,2]'],
    ['string', '"hello"'],
    ['number', '42'],
    ['null', 'null'],
  ])('treats a valid non-object JSON %s as no arguments', (_label, raw) => {
    expect(parseToolCallArguments('some_tool', raw)).toEqual({ args: {} });
  });

  it('passes through arguments that are already an object', () => {
    const structured = { path: 'a.txt' };
    expect(parseToolCallArguments('write_file', structured)).toEqual({
      args: structured,
    });
  });

  it('copies parsed arguments so callers cannot mutate shared state', () => {
    const first = parseToolCallArguments('t', '{"a":1}');
    first.args['a'] = 2;
    expect(parseToolCallArguments('t', '{"a":1}').args).toEqual({ a: 1 });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an array', [1, 2]],
  ])('returns no arguments for %s', (_label, raw) => {
    expect(parseToolCallArguments('some_tool', raw)).toEqual({ args: {} });
  });
});
