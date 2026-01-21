/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useToolScheduler } from './useToolScheduler.js';
import { useReactToolScheduler } from './useReactToolScheduler.js';
import { useToolExecutionScheduler } from './useToolExecutionScheduler.js';
import type { Config } from '@google/gemini-cli-core';

vi.mock('./useReactToolScheduler.js', () => ({
  useReactToolScheduler: vi.fn().mockReturnValue(['legacy']),
}));

vi.mock('./useToolExecutionScheduler.js', () => ({
  useToolExecutionScheduler: vi.fn().mockReturnValue(['modern']),
}));

describe('useToolScheduler (Facade)', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to useReactToolScheduler when event-driven scheduler is disabled', () => {
    mockConfig = {
      isEventDrivenSchedulerEnabled: () => false,
    } as unknown as Config;

    const onComplete = vi.fn();
    const getPreferredEditor = vi.fn();

    const { result } = renderHook(() =>
      useToolScheduler(onComplete, mockConfig, getPreferredEditor),
    );

    expect(result.current).toEqual(['legacy']);
    expect(useReactToolScheduler).toHaveBeenCalledWith(
      onComplete,
      mockConfig,
      getPreferredEditor,
    );
    expect(useToolExecutionScheduler).not.toHaveBeenCalled();
  });

  it('delegates to useToolExecutionScheduler when event-driven scheduler is enabled', () => {
    mockConfig = {
      isEventDrivenSchedulerEnabled: () => true,
    } as unknown as Config;

    const onComplete = vi.fn();
    const getPreferredEditor = vi.fn();

    const { result } = renderHook(() =>
      useToolScheduler(onComplete, mockConfig, getPreferredEditor),
    );

    expect(result.current).toEqual(['modern']);
    expect(useToolExecutionScheduler).toHaveBeenCalledWith(
      onComplete,
      mockConfig,
      getPreferredEditor,
    );
    expect(useReactToolScheduler).not.toHaveBeenCalled();
  });
});
