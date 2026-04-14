/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getDesiredVimCursorShape,
  VIM_CURSOR_SHAPE_DEFAULT,
  VIM_CURSOR_SHAPE_INSERT,
  VIM_CURSOR_SHAPE_NORMAL,
} from './useVimCursorShape.js';

describe('getDesiredVimCursorShape', () => {
  it('returns the insert cursor shape when vim mode is enabled in insert mode', () => {
    expect(
      getDesiredVimCursorShape({
        enabled: true,
        vimEnabled: true,
        vimMode: 'INSERT',
        lastApplied: null,
      }),
    ).toBe(VIM_CURSOR_SHAPE_INSERT);
  });

  it('returns the normal cursor shape when vim mode is enabled in normal mode', () => {
    expect(
      getDesiredVimCursorShape({
        enabled: true,
        vimEnabled: true,
        vimMode: 'NORMAL',
        lastApplied: VIM_CURSOR_SHAPE_INSERT,
      }),
    ).toBe(VIM_CURSOR_SHAPE_NORMAL);
  });

  it('returns the default cursor shape when the feature is disabled after a custom cursor was applied', () => {
    expect(
      getDesiredVimCursorShape({
        enabled: false,
        vimEnabled: true,
        vimMode: 'NORMAL',
        lastApplied: VIM_CURSOR_SHAPE_NORMAL,
      }),
    ).toBe(VIM_CURSOR_SHAPE_DEFAULT);
  });

  it('returns the default cursor shape when vim mode is turned off after a custom cursor was applied', () => {
    expect(
      getDesiredVimCursorShape({
        enabled: true,
        vimEnabled: false,
        vimMode: 'INSERT',
        lastApplied: VIM_CURSOR_SHAPE_INSERT,
      }),
    ).toBe(VIM_CURSOR_SHAPE_DEFAULT);
  });

  it('returns null when there is nothing to reset', () => {
    expect(
      getDesiredVimCursorShape({
        enabled: false,
        vimEnabled: false,
        vimMode: 'INSERT',
        lastApplied: null,
      }),
    ).toBeNull();
  });
});
