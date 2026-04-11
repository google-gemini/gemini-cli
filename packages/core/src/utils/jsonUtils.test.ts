/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { extractAndParseJson } from './jsonUtils.js';

describe('extractAndParseJson', () => {
  it('should parse pure JSON objects', () => {
    const input = '{"key": "value"}';
    expect(extractAndParseJson(input)).toEqual({ key: 'value' });
  });

  it('should parse pure JSON arrays', () => {
    const input = '[1, 2, 3]';
    expect(extractAndParseJson(input)).toEqual([1, 2, 3]);
  });

  it('should extract JSON from conversational filler (The Watcher Bug)', () => {
    const input =
      'Subagent "watcher" finished with result: {"userDirections": "Keep going", "progressSummary": "Done", "evaluation": "ON_TRACK"}';
    expect(extractAndParseJson(input)).toEqual({
      userDirections: 'Keep going',
      progressSummary: 'Done',
      evaluation: 'ON_TRACK',
    });
  });

  it('should extract JSON from markdown code blocks', () => {
    const input =
      'Here is the report:\n```json\n{"status": "ok"}\n```\nHope this helps!';
    expect(extractAndParseJson(input)).toEqual({ status: 'ok' });
  });

  it('should handle leading and trailing filler simultaneously', () => {
    const input = 'PREFIX {"a": 1} SUFFIX';
    expect(extractAndParseJson(input)).toEqual({ a: 1 });
  });

  it('should handle nested braces correctly', () => {
    const input = 'Result: {"outer": {"inner": 42}} - end';
    expect(extractAndParseJson(input)).toEqual({ outer: { inner: 42 } });
  });

  it('should fallback to full string if no braces found (for numbers/booleans/strings)', () => {
    expect(extractAndParseJson('true')).toBe(true);
    expect(extractAndParseJson('123')).toBe(123);
    expect(extractAndParseJson('"just a string"')).toBe('just a string');
  });

  it('should throw SyntaxError for truly invalid JSON', () => {
    expect(() => extractAndParseJson('not json at all')).toThrow(SyntaxError);
    expect(() => extractAndParseJson('{"unfinished": ')).toThrow(SyntaxError);
  });
});
