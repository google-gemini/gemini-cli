/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAlternateBufferEnabled } from './useAlternateBuffer.js';
import type { LoadedSettings } from '../../config/settings.js';
import { shouldDisableAlternateBufferByDefault } from '../../utils/terminalEnvironment.js';

// Mock the terminal environment utility
vi.mock('../../utils/terminalEnvironment.js', () => ({
  shouldDisableAlternateBufferByDefault: vi.fn(),
}));

describe('isAlternateBufferEnabled', () => {
  let mockSettings: LoadedSettings;

  beforeEach(() => {
    mockSettings = {
      merged: {
        ui: {},
      },
    } as unknown as LoadedSettings;

    vi.resetAllMocks();
  });

  it('should return false if useAlternateBuffer is explicitly false', () => {
    mockSettings.merged.ui = { useAlternateBuffer: false };
    // Environment shouldn't matter here
    vi.mocked(shouldDisableAlternateBufferByDefault).mockReturnValue(false);
    expect(isAlternateBufferEnabled(mockSettings)).toBe(false);
  });

  describe('when environment requires disablement (shouldDisableAlternateBufferByDefault = true)', () => {
    beforeEach(() => {
      vi.mocked(shouldDisableAlternateBufferByDefault).mockReturnValue(true);
    });

    it('should return false by default', () => {
      mockSettings.merged.ui = { useAlternateBuffer: true }; // Default is true in schema
      expect(isAlternateBufferEnabled(mockSettings)).toBe(false);
    });

    it('should return true if forceAlternateBuffer is true', () => {
      mockSettings.merged.ui = {
        useAlternateBuffer: true,
        forceAlternateBuffer: true,
      };
      expect(isAlternateBufferEnabled(mockSettings)).toBe(true);
    });

    it('should return false if forceAlternateBuffer is false', () => {
      mockSettings.merged.ui = {
        useAlternateBuffer: true,
        forceAlternateBuffer: false,
      };
      expect(isAlternateBufferEnabled(mockSettings)).toBe(false);
    });
  });

  describe('when environment allows alternate buffer (shouldDisableAlternateBufferByDefault = false)', () => {
    beforeEach(() => {
      vi.mocked(shouldDisableAlternateBufferByDefault).mockReturnValue(false);
    });

    it('should return true by default', () => {
      mockSettings.merged.ui = { useAlternateBuffer: true };
      expect(isAlternateBufferEnabled(mockSettings)).toBe(true);
    });

    it('should return true if forceAlternateBuffer is true (redundant but safe)', () => {
      mockSettings.merged.ui = {
        useAlternateBuffer: true,
        forceAlternateBuffer: true,
      };
      expect(isAlternateBufferEnabled(mockSettings)).toBe(true);
    });
  });
});
