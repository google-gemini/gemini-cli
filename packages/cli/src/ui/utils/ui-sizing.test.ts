/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { calculateMainAreaWidth } from './ui-sizing.js';
import { type LoadedSettings } from '../../config/settings.js';

// Mock dependencies
const mocks = vi.hoisted(() => ({
  isAlternateBufferEnabled: vi.fn(),
}));

vi.mock('../hooks/useAlternateBuffer.js', () => ({
  isAlternateBufferEnabled: mocks.isAlternateBufferEnabled,
}));

describe('ui-sizing', () => {
  const createSettings = (useFullWidth?: boolean): LoadedSettings =>
    ({
      merged: {
        ui: {
          useFullWidth,
        },
      },
    }) as unknown as LoadedSettings;

  describe('calculateMainAreaWidth', () => {
    it.each([
      // expected, width, altBuffer
      [80, 80, false],
      [100, 100, false],
      [79, 80, true],
      [99, 100, true],
    ])(
      'should return %i when width=%i and altBuffer=%s',
      (expected, width, altBuffer) => {
        mocks.isAlternateBufferEnabled.mockReturnValue(altBuffer);
        const settings = createSettings();

        expect(calculateMainAreaWidth(width, settings)).toBe(expected);
      },
    );
  });
});
