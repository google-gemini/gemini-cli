/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import {
  useAlternateBuffer,
  isAlternateBufferEnabled,
} from './useAlternateBuffer.js';
import type { Config } from '@google/gemini-cli-core';

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
  it('should return true when config.getUseAlternateBuffer returns true', () => {
    const config = {
      getUseAlternateBuffer: () => true,
    } as unknown as Config;

    expect(isAlternateBufferEnabled(config)).toBe(true);
  });

  it('should return false when config.getUseAlternateBuffer returns false', () => {
    const config = {
      getUseAlternateBuffer: () => false,
    } as unknown as Config;

    expect(isAlternateBufferEnabled(config)).toBe(false);
  });
});
