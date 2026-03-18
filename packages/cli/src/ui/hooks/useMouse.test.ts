/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useMouse } from './useMouse.js';
import { useMouseContext } from '../contexts/MouseContext.js';

vi.mock('../contexts/MouseContext.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../contexts/MouseContext.js')>();
  const subscribe = vi.fn();
  const unsubscribe = vi.fn();
  return {
    ...actual,
    useMouseContext: vi.fn(() => ({
      subscribe,
      unsubscribe,
    })),
  };
});

describe('useMouse', () => {
  const mockOnMouseEvent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not subscribe when isActive is false', () => {
    renderHook(() => useMouse(mockOnMouseEvent, { isActive: false }));

    const { subscribe } = useMouseContext();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('should subscribe when isActive is true', () => {
    renderHook(() => useMouse(mockOnMouseEvent, { isActive: true }));

    const { subscribe } = useMouseContext();
    expect(subscribe).toHaveBeenCalledWith(mockOnMouseEvent);
  });

  it('should unsubscribe on unmount', () => {
    const { unmount } = renderHook(() =>
      useMouse(mockOnMouseEvent, { isActive: true }),
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
      },
    );

    const { unsubscribe } = useMouseContext();
    rerender({ isActive: false });
    expect(unsubscribe).toHaveBeenCalledWith(mockOnMouseEvent);
  });
});
