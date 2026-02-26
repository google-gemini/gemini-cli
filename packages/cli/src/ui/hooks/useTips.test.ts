/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  renderHookWithProviders,
  persistentStateMock,
} from '../../test-utils/render.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTips } from './useTips.js';

describe('useTips()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false and call set(1) if state is undefined', () => {
    const { result } = renderHookWithProviders(() => useTips());

    expect(result.current.showTips).toBe(true);

    expect(persistentStateMock.set).toHaveBeenCalledWith('hideTipsShown', 1);
    expect(persistentStateMock.get('hideTipsShown')).toBe(1);
  });

  it('should return false and call set(6) if state is 5', () => {
    persistentStateMock.setData({ hideTipsShown: 5 });

    const { result } = renderHookWithProviders(() => useTips());

    expect(result.current.showTips).toBe(true);

    expect(persistentStateMock.get('hideTipsShown')).toBe(6);
  });

  it('should return true if state is 10', () => {
    persistentStateMock.setData({ hideTipsShown: 10 });

    const { result } = renderHookWithProviders(() => useTips());

    expect(result.current.showTips).toBe(false);
    expect(persistentStateMock.set).not.toHaveBeenCalled();
    expect(persistentStateMock.get('hideTipsShown')).toBe(10);
  });
});
