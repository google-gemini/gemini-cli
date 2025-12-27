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
      // width, useFullWidth, alternateBuffer, expected
      [80, true, false, 80],
      [100, true, false, 100],
      [80, true, true, 79], // -1 for alternate buffer
      [100, true, true, 99],

      // Default behavior (useFullWidth true)
      [100, true, false, 100],

      // useFullWidth: false (Smart sizing)
      [80, false, false, 78], // 98% of 80
      [132, false, false, 119], // 90% of 132
      [200, false, false, 180], // 90% of 200 (>= 132)

      // Interpolation check
      [106, false, false, 100], // Approx middle
    ])(
      'should return %i when width=%i, useFullWidth=%s, altBuffer=%s',
      (width, useFullWidth, altBuffer, expected) => {
        mocks.isAlternateBufferEnabled.mockReturnValue(altBuffer);
        const settings = createSettings(useFullWidth);

        expect(calculateMainAreaWidth(width, settings)).toBe(expected);
      },
    );

    it('should match snapshot for interpolation range', () => {
      mocks.isAlternateBufferEnabled.mockReturnValue(false);
      const settings = createSettings(false);

      const results: Record<number, number> = {};
      // Test range from 80 to 132
      for (let w = 80; w <= 132; w += 4) {
        results[w] = calculateMainAreaWidth(w, settings);
      }

      expect(results).toMatchSnapshot();
    });
  });
});
