/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHookWithProviders } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTips } from './useTips.js';
import { persistentState } from '../../utils/persistentState.js';

vi.mock('../../utils/persistentState.js', () => ({
  persistentState: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('useTips()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false and call set(true) if state is undefined', () => {
    vi.mocked(persistentState.get).mockReturnValue(undefined);

    const { result } = renderHookWithProviders(() => useTips());

    expect(result.current).toBe(false);

    expect(persistentState.set).toHaveBeenCalledWith('tipsShown', true);
  });

  it('should return true if state is already true', () => {
    vi.mocked(persistentState.get).mockReturnValue(true);

    const { result } = renderHookWithProviders(() => useTips());

    expect(result.current).toBe(true);
    expect(persistentState.set).not.toHaveBeenCalled();
  });
});
