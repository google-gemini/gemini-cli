/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  shouldDisableLineWrapping,
  shouldEnterAlternateScreen,
} from './terminal.js';

describe('shouldEnterAlternateScreen', () => {
  it('enters the alternate screen only when enabled and no screen reader is active', () => {
    expect(shouldEnterAlternateScreen(true, false)).toBe(true);
    expect(shouldEnterAlternateScreen(true, true)).toBe(false);
    expect(shouldEnterAlternateScreen(false, false)).toBe(false);
    expect(shouldEnterAlternateScreen(false, true)).toBe(false);
  });
});

describe('shouldDisableLineWrapping', () => {
  it('keeps auto-wrap on for a standard terminal in inline mode', () => {
    expect(shouldDisableLineWrapping(false, false)).toBe(false);
  });

  it('turns auto-wrap off in the alternate buffer', () => {
    expect(shouldDisableLineWrapping(true, false)).toBe(true);
  });

  it('turns auto-wrap off when ambiguous-width characters render as two cells', () => {
    expect(shouldDisableLineWrapping(false, true)).toBe(true);
    expect(shouldDisableLineWrapping(true, true)).toBe(true);
  });
});
