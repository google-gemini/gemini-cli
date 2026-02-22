/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { detectOmissionPlaceholder } from './omissionPlaceholderDetector.js';

describe('detectOmissionPlaceholder', () => {
  it('detects standalone placeholder lines', () => {
    expect(detectOmissionPlaceholder('(rest of methods ...)')).toEqual({
      found: true,
      match: '(rest of methods ...)',
    });
    expect(detectOmissionPlaceholder('(rest of code ...)')).toEqual({
      found: true,
      match: '(rest of code ...)',
    });
    expect(detectOmissionPlaceholder('(unchanged code ...)')).toEqual({
      found: true,
      match: '(unchanged code ...)',
    });
    expect(detectOmissionPlaceholder('// rest of methods ...')).toEqual({
      found: true,
      match: '// rest of methods ...',
    });
  });

  it('detects case-insensitive placeholders', () => {
    expect(detectOmissionPlaceholder('(Rest Of Methods ...)')).toEqual({
      found: true,
      match: '(Rest Of Methods ...)',
    });
  });

  it('detects placeholder lines inside larger multiline text', () => {
    const text = `class Example {\n  methodA() {}\n  (rest of methods ...)\n}`;
    expect(detectOmissionPlaceholder(text)).toEqual({
      found: true,
      match: '(rest of methods ...)',
    });
  });

  it('does not detect placeholders embedded in normal code', () => {
    expect(
      detectOmissionPlaceholder(
        'const note = "(rest of methods ...)";\nconsole.log(note);',
      ),
    ).toEqual({
      found: false,
    });
  });

  it('does not detect text without ellipsis marker', () => {
    expect(detectOmissionPlaceholder('(rest of methods)')).toEqual({
      found: false,
    });
  });

  it('does not detect unrelated ellipsis text', () => {
    expect(detectOmissionPlaceholder('const message = "loading...";')).toEqual({
      found: false,
    });
  });

  it('does not detect omission phrase when it is inline code/comment context', () => {
    expect(
      detectOmissionPlaceholder('return value; // rest of methods ...'),
    ).toEqual({
      found: false,
    });
  });
});
