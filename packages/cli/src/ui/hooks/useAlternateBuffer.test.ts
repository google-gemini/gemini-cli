/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHookWithProviders } from '../../test-utils/render.js';
import {
  useAlternateBuffer,
  isAlternateBufferEnabled,
} from './useAlternateBuffer.js';
import type { Config } from '@google/gemini-cli-core';

describe('useAlternateBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when config.getUseAlternateBuffer returns false', () => {
    const { result } = renderHookWithProviders(() => useAlternateBuffer(), {
      useAlternateBuffer: false,
    });
    expect(result.current).toBe(false);
  });

  it('should return true when config.getUseAlternateBuffer returns true', () => {
    const { result } = renderHookWithProviders(() => useAlternateBuffer(), {
      useAlternateBuffer: true,
    });
    expect(result.current).toBe(true);
  });

  it('should return the immutable config value, not react to settings changes', () => {
    const { result, rerender } = renderHookWithProviders(
      () => useAlternateBuffer(),
      {
        useAlternateBuffer: true,
      },
    );

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
      getUiCompatibility: () => ({}),
    } as unknown as Config;

    expect(isAlternateBufferEnabled(config)).toBe(true);
  });

  it('should return false when config.getUseAlternateBuffer returns false', () => {
    const config = {
      getUseAlternateBuffer: () => false,
      getUiCompatibility: () => ({}),
    } as unknown as Config;

    expect(isAlternateBufferEnabled(config)).toBe(false);
  });
});
