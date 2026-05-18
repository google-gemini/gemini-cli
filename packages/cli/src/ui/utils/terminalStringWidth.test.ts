/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  clearStringWidthCache,
  styledCharsWidth,
  toStyledCharacters,
} from 'ink';
import { describe, expect, it } from 'vitest';
import { configureInkStringWidth } from './configureInkStringWidth.js';
import { getTerminalStringWidth } from './terminalStringWidth.js';

describe('getTerminalStringWidth', () => {
  it.each([
    ['กำ', 2],
    ['ทำ', 2],
    ['แนะนำ', 5],
    ['ນຳ', 2],
    ['ำ', 1],
    ['👩🏽‍💻', 2],
    ['क्ष', 1],
  ])('measures %s as %d columns', (input, expectedWidth) => {
    expect(getTerminalStringWidth(input)).toBe(expectedWidth);
  });
});

describe('configureInkStringWidth', () => {
  it('keeps Ink aligned with terminal width for Thai and Lao SARA AM', () => {
    configureInkStringWidth();
    clearStringWidthCache();

    expect(styledCharsWidth(toStyledCharacters('กำ'))).toBe(2);
    expect(styledCharsWidth(toStyledCharacters('ນຳ'))).toBe(2);
    expect(styledCharsWidth(toStyledCharacters('👩🏽‍💻'))).toBe(2);
  });
});
