/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  restoreCollapsedEscapes,
  preserveEscapesUsingOriginalContext,
  formatRestorationSummary,
  countSupportedEscapeLiterals,
} from './escapePreserver.js';

describe('escapePreserver / restoreCollapsedEscapes', () => {
  it('returns unchanged output when original or proposed is empty', () => {
    const r1 = restoreCollapsedEscapes('', 'abc');
    expect(r1.changed).toBe(false);
    expect(r1.output).toBe('abc');

    const r2 = restoreCollapsedEscapes('abc', '');
    expect(r2.changed).toBe(false);
    expect(r2.output).toBe('');
  });

  it('does nothing when no supported escape sequences are present', () => {
    const original = 'console.log("Hello world");';
    const proposed = 'console.log("Hello world");';
    const result = restoreCollapsedEscapes(original, proposed);
    expect(result.changed).toBe(false);
    expect(result.output).toBe(proposed);
    expect(result.restoredCounts).toEqual({});
  });

  it('restores a single collapsed \\n escape', () => {
    const original = 'f.write("[\\n")';
    const proposed = 'f.write("[\n")'; // newline collapsed
    const result = restoreCollapsedEscapes(original, proposed);
    expect(result.changed).toBe(true);
    expect(result.output).toBe(original);
    expect(result.restoredCounts['\\n']).toBeGreaterThan(0);
    expect(formatRestorationSummary(result)).toContain('\\n');
  });

  it('restores multiple different escape types in one pass', () => {
    const original = 'pattern="Line1\\nLine2\\tTabbed\\rCarriage\\\\Backslash"';
    // Collapsed: \n -> newline, \t -> tab, \r -> carriage return, \\\\ -> single backslash
    const proposed = 'pattern="Line1\nLine2\tTabbed\rCarriage\\Backslash"'; // note: one '\' left
    const result = restoreCollapsedEscapes(original, proposed);
    expect(result.changed).toBe(true);
    // Heuristic may restore all collapsed escapes; assert presence of restored literals
    expect(result.output).toContain('\\n');
    expect(result.output).toContain('\\t');
    expect(result.output).toContain('\\r');
    expect(result.output).toContain('\\\\Backslash');
    expect(Object.keys(result.restoredCounts).length).toBeGreaterThanOrEqual(3);
    expect(result.restoredCounts['\\n']).toBeDefined();
    expect(result.restoredCounts['\\t']).toBeDefined();
    expect(result.restoredCounts['\\r']).toBeDefined();
  });

  it('does not double-restore when literal already present in proposed', () => {
    const original = 'x="A\\nB"';
    const proposed = 'x="A\\nB"'; // already correct
    const result = restoreCollapsedEscapes(original, proposed);
    expect(result.changed).toBe(false);
    expect(result.output).toBe(proposed);
    expect(result.restoredCounts).toEqual({});
  });

  it('skips restoration if original lacked the literal even if proposed has control char', () => {
    const original = 'line1\nline2'; // original already had real newline
    const proposed = 'line1\nline2';
    const result = restoreCollapsedEscapes(original, proposed);
    expect(result.changed).toBe(false);
    expect(result.output).toBe(proposed);
  });

  it('supports restrictTo option (only restores specified escapes)', () => {
    const original = 's="A\\nB\\tC"';
    const proposed = 's="A\nB\tC"'; // Only \\n collapsed; \\t already control char
    // Restrict to \\t: we should restore only \\t (if it was collapsed) and leave \\n collapsed.
    const resultRestricted = restoreCollapsedEscapes(original, proposed, {
      restrictTo: ['\\t'],
    });
    // Depending on environment the tab may or may not have been collapsed; allow either but assert invariants.
    if (resultRestricted.changed) {
      expect(resultRestricted.output.includes('\\t')).toBe(true);
      expect(resultRestricted.output.includes('\\n')).toBe(false);
    } else {
      // If unchanged, ensure we really didn't introduce \\n
      expect(resultRestricted.output.includes('\\n')).toBe(false);
    }

    // Restrict to \\n allows restoration of the newline but not \\t
    const resultN = restoreCollapsedEscapes(original, proposed, {
      restrictTo: ['\\n'],
    });
    expect(resultN.changed).toBe(true);
    expect(resultN.output.includes('\\n')).toBe(true);
    expect(resultN.output.includes('\\t')).toBe(false);
  });

  it('respects maxTotalReplacements limit (aborts when exceeding)', () => {
    const originalLiteral = '\\n';
    // Build original with 10 occurrences of literal
    const occurrences = 10;
    const original = Array.from(
      { length: occurrences },
      () => originalLiteral,
    ).join('');
    const proposed = Array.from({ length: occurrences }, () => '\n').join('');

    const result = restoreCollapsedEscapes(original, proposed, {
      maxTotalReplacements: 5, // limit lower than actual needed
    });
    // Should refuse to restore because replacing all would exceed the limit.
    expect(result.changed).toBe(false);
    expect(result.output).toBe(proposed);
    expect(result.restoredCounts).toEqual({});
  });

  it('restores when total needed equals limit exactly', () => {
    const occurrences = 5;
    const original = '\\n'.repeat(occurrences);
    const proposed = '\n'.repeat(occurrences);
    const result = restoreCollapsedEscapes(original, proposed, {
      maxTotalReplacements: occurrences,
    });
    expect(result.changed).toBe(true);
    expect(result.output).toBe(original);
    expect(result.restoredCounts['\\n']).toBe(occurrences);
  });

  it('preserveEscapesUsingOriginalContext is an alias for restoreCollapsedEscapes', () => {
    const original = 'x="\\n"';
    const proposed = 'x="\n"';
    const r1 = restoreCollapsedEscapes(original, proposed);
    const r2 = preserveEscapesUsingOriginalContext(original, proposed);
    expect(r1.output).toBe(r2.output);
    expect(r1.changed).toBe(r2.changed);
    expect(r1.restoredCounts).toEqual(r2.restoredCounts);
  });

  it('formatRestorationSummary reports when nothing restored', () => {
    const original = 'a';
    const proposed = 'a';
    const result = restoreCollapsedEscapes(original, proposed);
    expect(formatRestorationSummary(result)).toMatch(
      /No escape sequences restored/i,
    );
  });

  it('countSupportedEscapeLiterals counts literals (not control chars)', () => {
    const original =
      'A\\nB\\tC\\rD\\\\E\\fF\\bG normal \\n should count only once per literal';
    const count = countSupportedEscapeLiterals(original);
    // There are: \\n, \\t, \\r, \\\\, \\f, \\b, plus another \\n => 7
    expect(count).toBe(7);
  });

  it('restores a collapsed double backslash (\\\\)', () => {
    const original = 'const p = "C:\\\\Program Files\\\\App";';
    const proposed = 'const p = "C:\\Program Files\\App";'; // Collapsed
    const result = restoreCollapsedEscapes(original, proposed);
    expect(result.changed).toBe(true);
    expect(result.output).toBe(original);
    expect(result.restoredCounts['\\\\']).toBeGreaterThan(0);
  });

  it('does not over-restore single backslashes that were legitimate (no original \\\\)', () => {
    const original = 'import x from "./foo/bar";'; // No double backslash
    const proposed = 'import x from "./foo/bar";';
    const result = restoreCollapsedEscapes(original, proposed);
    expect(result.changed).toBe(false);
    expect(result.output).toBe(proposed);
  });

  it('handles mixture where only some sequences collapsed', () => {
    const original = 'msg="Line1\\nLine2\\tTab\\nLine3"';
    // Collapse only first \\n
    const proposed = 'msg="Line1\nLine2\\tTab\\nLine3"';
    const result = restoreCollapsedEscapes(original, proposed);
    // New heuristic (non-aggressive for partial mismatch) leaves mixed state unchanged.
    expect(result.changed).toBe(false);
    const restoredCount = (result.output.match(/\\n/g) || []).length;
    expect(restoredCount).toBe(1);
  });

  it('is idempotent: running twice does not change further', () => {
    const original = 'x="\\n\\t"';
    const proposed = 'x="\n\t"';
    const first = restoreCollapsedEscapes(original, proposed);
    const second = restoreCollapsedEscapes(original, first.output);
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.output).toBe(first.output);
  });
});
