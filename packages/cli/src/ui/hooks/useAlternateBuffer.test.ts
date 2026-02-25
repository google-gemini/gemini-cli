/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import {
  useAlternateBuffer,
  isAlternateBufferEnabled,
} from './useAlternateBuffer.js';
import type { LoadedSettings } from '../../config/settings.js';

vi.mock('../contexts/ConfigContext.js', () => ({
  useConfig: vi.fn(),
}));

const mockUseConfig = vi.mocked(
  await import('../contexts/ConfigContext.js').then((m) => m.useConfig),
);

describe('useAlternateBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when config.getUseAlternateBuffer returns false', () => {
    mockUseConfig.mockReturnValue({
      getUseAlternateBuffer: () => false,
    } as unknown as ReturnType<typeof mockUseConfig>);

    const { result } = renderHook(() => useAlternateBuffer());
    expect(result.current).toBe(false);
  });

  it('should return true when config.getUseAlternateBuffer returns true', () => {
    mockUseConfig.mockReturnValue({
      getUseAlternateBuffer: () => true,
    } as unknown as ReturnType<typeof mockUseConfig>);

    const { result } = renderHook(() => useAlternateBuffer());
    expect(result.current).toBe(true);
  });

  it('should return the immutable config value, not react to settings changes', () => {
    const mockConfig = {
      getUseAlternateBuffer: () => true,
    } as unknown as ReturnType<typeof mockUseConfig>;

    mockUseConfig.mockReturnValue(mockConfig);

    const { result, rerender } = renderHook(() => useAlternateBuffer());

    // Value should remain true even after rerender
    expect(result.current).toBe(true);

    rerender();

    expect(result.current).toBe(true);
  });
});

describe('isAlternateBufferEnabled', () => {
  it('should return true when settings.merged.ui.useAlternateBuffer is true', () => {
    const settings = {
      merged: {
        ui: {
          useAlternateBuffer: true,
        },
      },
    } as unknown as LoadedSettings;

    expect(isAlternateBufferEnabled(settings)).toBe(true);
  });

  it('should return false when settings.merged.ui.useAlternateBuffer is false', () => {
    const settings = {
      merged: {
        ui: {
          useAlternateBuffer: false,
        },
      },
    } as unknown as LoadedSettings;

    expect(isAlternateBufferEnabled(settings)).toBe(false);
  });

  it('should return false when settings.merged.ui.useAlternateBuffer is undefined', () => {
    const settings = {
      merged: {
        ui: {},
      },
    } as unknown as LoadedSettings;

    expect(isAlternateBufferEnabled(settings)).toBe(false);
  });
});
