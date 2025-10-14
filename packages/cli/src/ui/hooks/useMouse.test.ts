/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { useMouse } from './useMouse.js';
import { MouseProvider, useMouseContext } from '../contexts/MouseContext.js';

vi.mock('../contexts/MouseContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../contexts/MouseContext.js')>();
  const subscribe = vi.fn();
  const unsubscribe = vi.fn();
  return {
    ...actual,
    useMouseContext: () => ({
      subscribe,
      unsubscribe,
    }),
  };
});

describe('useMouse', () => {
  const mockOnMouseEvent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not subscribe when isActive is false', () => {
    renderHook(() => useMouse(mockOnMouseEvent, { isActive: false }), {
      wrapper: MouseProvider,
    });

    const { subscribe } = useMouseContext();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('should subscribe when isActive is true', () => {
    renderHook(() => useMouse(mockOnMouseEvent, { isActive: true }), {
      wrapper: MouseProvider,
    });

    const { subscribe } = useMouseContext();
    expect(subscribe).toHaveBeenCalledWith(mockOnMouseEvent);
  });

  it('should unsubscribe on unmount', () => {
    const { unmount } = renderHook(
      () => useMouse(mockOnMouseEvent, { isActive: true }),
      { wrapper: MouseProvider },
    );

    const { unsubscribe } = useMouseContext();
    unmount();
    expect(unsubscribe).toHaveBeenCalledWith(mockOnMouseEvent);
  });

  it('should unsubscribe when isActive becomes false', () => {
    const { rerender } = renderHook(
      ({ isActive }: { isActive: boolean }) =>
        useMouse(mockOnMouseEvent, { isActive }),
      {
        initialProps: { isActive: true },
        wrapper: MouseProvider,
      },
    );

    const { unsubscribe } = useMouseContext();
    rerender({ isActive: false });
    expect(unsubscribe).toHaveBeenCalledWith(mockOnMouseEvent);
  });
});
