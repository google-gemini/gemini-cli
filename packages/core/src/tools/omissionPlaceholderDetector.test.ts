/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { detectOmissionPlaceholders } from './omissionPlaceholderDetector.js';

describe('detectOmissionPlaceholders', () => {
  it('detects standalone placeholder lines', () => {
    expect(detectOmissionPlaceholders('(rest of methods ...)')).toEqual([
      'rest of methods ...',
    ]);
    expect(detectOmissionPlaceholders('(rest of code ...)')).toEqual([
      'rest of code ...',
    ]);
    expect(detectOmissionPlaceholders('(unchanged code ...)')).toEqual([
      'unchanged code ...',
    ]);
    expect(detectOmissionPlaceholders('// rest of methods ...')).toEqual([
      'rest of methods ...',
    ]);
  });

  it('detects case-insensitive placeholders', () => {
    expect(detectOmissionPlaceholders('(Rest Of Methods ...)')).toEqual([
      'rest of methods ...',
    ]);
  });

  it('detects multiple placeholder lines in one input', () => {
    const text = `class Example {
  run() {}
  (rest of methods ...)
  (unchanged code ...)
}`;
    expect(detectOmissionPlaceholders(text)).toEqual([
      'rest of methods ...',
      'unchanged code ...',
    ]);
  });

  it('does not detect placeholders embedded in normal code', () => {
    expect(
      detectOmissionPlaceholders(
        'const note = "(rest of methods ...)";\nconsole.log(note);',
      ),
    ).toEqual([]);
  });

  it('does not detect omission phrase when inline in a comment', () => {
    expect(
      detectOmissionPlaceholders('return value; // rest of methods ...'),
    ).toEqual([]);
  });

  it('does not detect unrelated ellipsis text', () => {
    expect(detectOmissionPlaceholders('const message = "loading...";')).toEqual(
      [],
    );
  });
});
