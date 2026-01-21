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

  it('should return false and call set(1) if state is undefined', () => {
    vi.mocked(persistentState.get).mockReturnValue(undefined);

    const { result } = renderHookWithProviders(() => useTips());

    expect(result.current.showTips).toBe(true);

    expect(persistentState.set).toHaveBeenCalledWith('tipsShown', 1);
  });

  it('should return false and call set(6) if state is 5', () => {
    vi.mocked(persistentState.get).mockReturnValue(5);

    const { result } = renderHookWithProviders(() => useTips());

    expect(result.current.showTips).toBe(true);

    expect(persistentState.set).toHaveBeenCalledWith('tipsShown', 6);
  });

  it('should return true if state is 10', () => {
    vi.mocked(persistentState.get).mockReturnValue(10);

    const { result } = renderHookWithProviders(() => useTips());

    expect(result.current.showTips).toBe(false);
    expect(persistentState.set).not.toHaveBeenCalled();
  });
});
