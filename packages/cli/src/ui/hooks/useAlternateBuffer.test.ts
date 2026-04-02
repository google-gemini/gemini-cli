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
import { useUIState } from '../contexts/UIStateContext.js';

vi.mock('../contexts/UIStateContext.js');

const mockUseUIState = vi.mocked(useUIState);

describe('useAlternateBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when uiState.isAlternateBuffer is false', async () => {
    mockUseUIState.mockReturnValue({
      isAlternateBuffer: false,
    } as unknown as ReturnType<typeof mockUseUIState>);

    const { result } = await renderHook(() => useAlternateBuffer());
    expect(result.current).toBe(false);
  });

  it('should return true when uiState.isAlternateBuffer is true', async () => {
    mockUseUIState.mockReturnValue({
      isAlternateBuffer: true,
    } as unknown as ReturnType<typeof mockUseUIState>);

    const { result } = await renderHook(() => useAlternateBuffer());
    expect(result.current).toBe(true);
  });

  it('should react to state changes', async () => {
    mockUseUIState.mockReturnValue({
      isAlternateBuffer: false,
    } as unknown as ReturnType<typeof mockUseUIState>);

    const { result, rerender } = await renderHook(() => useAlternateBuffer());

    expect(result.current).toBe(false);

    mockUseUIState.mockReturnValue({
      isAlternateBuffer: true,
    } as unknown as ReturnType<typeof mockUseUIState>);

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
