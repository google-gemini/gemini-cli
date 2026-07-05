/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  formatToolLogChain,
  type ToolLogEntry,
} from '../utils/tool-log-formatter.js';

function makeEntry(
  overrides: Partial<ToolLogEntry['toolRequest']> = {},
): ToolLogEntry {
  return {
    toolRequest: {
      name: 'test_tool',
      args: '{}',
      success: true,
      duration_ms: 100,
      ...overrides,
    },
  };
}

describe('formatToolLogChain', () => {
  it('returns empty string for empty log array', () => {
    expect(formatToolLogChain([])).toBe('');
  });

  it('returns empty string for null/undefined input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatToolLogChain(null as any)).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatToolLogChain(undefined as any)).toBe('');
  });

  it('formats a single successful tool call', () => {
    const logs = [makeEntry({ name: 'grep_search', duration_ms: 42 })];
    const result = formatToolLogChain(logs);
    expect(result).toContain('1.');
    expect(result).toContain('grep_search()');
    expect(result).toContain('✓');
    expect(result).toContain('42ms');
  });

  it('formats a single failed tool call with error details', () => {
    const logs = [
      makeEntry({
        name: 'read_file',
        args: '{"path":"/src/foo.ts"}',
        success: false,
        duration_ms: 80,
        error: 'File not found',
        error_type: 'ENOENT',
      }),
    ];
    const result = formatToolLogChain(logs);
    expect(result).toContain('read_file(');
    expect(result).toContain('path="/src/foo.ts"');
    expect(result).toContain('✗');
    expect(result).toContain('80ms');
    expect(result).toContain('↳ Error: [ENOENT] File not found');
  });

  it('formats arguments as key=value pairs', () => {
    const logs = [
      makeEntry({
        name: 'grep_search',
        args: '{"query":"TODO","path":"/src"}',
      }),
    ];
    const result = formatToolLogChain(logs);
    expect(result).toContain('query="TODO"');
    expect(result).toContain('path="/src"');
  });

  it('truncates long argument values', () => {
    const longValue = 'a'.repeat(100);
    const logs = [
      makeEntry({
        name: 'write_file',
        args: JSON.stringify({ content: longValue }),
      }),
    ];
    const result = formatToolLogChain(logs);
    expect(result).toContain('…');
    expect(result).not.toContain(longValue);
  });

  it('handles invalid JSON in args gracefully', () => {
    const logs = [
      makeEntry({
        name: 'shell',
        args: 'not-json {{{',
      }),
    ];
    const result = formatToolLogChain(logs);
    expect(result).toContain('shell(');
    expect(result).toContain('not-json');
  });

  it('formats multiple tool calls with correct numbering', () => {
    const logs = [
      makeEntry({ name: 'grep_search', duration_ms: 10 }),
      makeEntry({ name: 'read_file', duration_ms: 20 }),
      makeEntry({
        name: 'write_file',
        success: false,
        duration_ms: 30,
        error: 'Permission denied',
      }),
    ];
    const result = formatToolLogChain(logs);
    const lines = result.split('\n');
    expect(lines[0]).toContain('1.');
    expect(lines[0]).toContain('grep_search');
    expect(lines[1]).toContain('2.');
    expect(lines[1]).toContain('read_file');
    expect(lines[2]).toContain('3.');
    expect(lines[2]).toContain('write_file');
    expect(lines[3]).toContain('↳ Error:');
    expect(lines[3]).toContain('Permission denied');
  });

  it('pads step numbers for double-digit counts', () => {
    const logs = Array.from({ length: 12 }, (_, i) =>
      makeEntry({ name: `tool_${i + 1}`, duration_ms: i * 10 }),
    );
    const result = formatToolLogChain(logs);
    const lines = result.split('\n');
    expect(lines[0]).toMatch(/\s+1\./);
    expect(lines[11]).toContain('12.');
  });

  it('shows failed call without error details when neither error nor error_type present', () => {
    const logs = [
      makeEntry({
        name: 'run_shell',
        success: false,
        duration_ms: 50,
      }),
    ];
    const result = formatToolLogChain(logs);
    expect(result).toContain('✗');
    expect(result).not.toContain('↳');
  });

  it('handles empty args string', () => {
    const logs = [makeEntry({ name: 'list_dir', args: '' })];
    const result = formatToolLogChain(logs);
    expect(result).toContain('list_dir()');
  });

  it('formats non-string argument values correctly', () => {
    const logs = [
      makeEntry({
        name: 'some_tool',
        args: '{"count":42,"nested":{"a":1},"flag":true}',
      }),
    ];
    const result = formatToolLogChain(logs);
    expect(result).toContain('count="42"');
    expect(result).toContain('flag="true"');
  });
});
