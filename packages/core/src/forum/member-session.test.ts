/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  formatForumThoughtActivity,
  formatToolArgsSummary,
} from './member-session.js';

describe('formatForumThoughtActivity', () => {
  it('combines the thought subject and description for live activity updates', () => {
    expect(
      formatForumThoughtActivity(
        '**Investigating loops** Tracing recursive retry paths in the scheduler.',
      ),
    ).toBe(
      'Investigating loops: Tracing recursive retry paths in the scheduler.',
    );
  });

  it('falls back to plain text thoughts when no bold subject is present', () => {
    expect(
      formatForumThoughtActivity(
        'Checking whether the same tool call can be re-enqueued twice.',
      ),
    ).toBe('Checking whether the same tool call can be re-enqueued twice.');
  });
});

describe('formatToolArgsSummary', () => {
  it('returns an empty string when args are missing or empty', () => {
    expect(formatToolArgsSummary(undefined)).toBe('');
    expect(formatToolArgsSummary(null)).toBe('');
    expect(formatToolArgsSummary({})).toBe('');
  });

  it('renders simple key/value pairs with quoted strings', () => {
    expect(
      formatToolArgsSummary({
        command: 'git --no-pager diff',
        is_background: false,
      }),
    ).toBe('command="git --no-pager diff", is_background=false');
  });

  it('clips long string values with a trailing ellipsis', () => {
    const long = 'a'.repeat(120);
    const summary = formatToolArgsSummary({ pattern: long });
    expect(summary.startsWith('pattern="')).toBe(true);
    expect(summary.endsWith('…"')).toBe(true);
    expect(summary.length).toBeLessThan(80);
  });

  it('summarises nested arrays by length and objects by key count', () => {
    expect(
      formatToolArgsSummary({
        files: ['a.ts', 'b.ts', 'c.ts'],
        options: { recursive: true, depth: 5 },
      }),
    ).toBe('files=[3], options={2 keys}');
  });

  it('caps total length and appends an overflow ellipsis', () => {
    const summary = formatToolArgsSummary({
      a: 'x'.repeat(60),
      b: 'y'.repeat(60),
      c: 'z'.repeat(60),
    });
    expect(summary.length).toBeLessThanOrEqual(140);
    expect(summary).toContain('…');
  });

  it('handles primitive values passed at the top level', () => {
    expect(formatToolArgsSummary(42)).toBe('42');
    expect(formatToolArgsSummary('plain')).toBe('"plain"');
    expect(formatToolArgsSummary([1, 2, 3])).toBe('[3]');
  });
});
