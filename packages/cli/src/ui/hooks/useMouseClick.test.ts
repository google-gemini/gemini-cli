/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useMouseClick } from './useMouseClick.js';
import { getBoundingBox, type DOMElement } from 'ink';
import type React from 'react';

// Mock ink
vi.mock('ink', async () => ({
  getBoundingBox: vi.fn(),
}));

// Mock MouseContext
const mockUseMouse = vi.fn();
vi.mock('../contexts/MouseContext.js', async () => ({
  useMouse: (cb: unknown, opts: unknown) => mockUseMouse(cb, opts),
}));

describe('useMouseClick', () => {
  let handler: Mock;
  let containerRef: React.RefObject<DOMElement | null>;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = vi.fn();
    containerRef = { current: {} as DOMElement };
  });

  it('should call handler with relative coordinates when click is inside bounds', () => {
    vi.mocked(getBoundingBox).mockReturnValue({
      x: 10,
      y: 5,
      width: 20,
      height: 10,
    } as unknown as ReturnType<typeof getBoundingBox>);

    renderHook(() => useMouseClick(containerRef, handler));

    // Get the callback registered with useMouse
    expect(mockUseMouse).toHaveBeenCalled();
    const callback = mockUseMouse.mock.calls[0][0];

    // Simulate click inside: x=15 (col 16), y=7 (row 8)
    // Terminal events are 1-based. col 16 -> mouseX 15. row 8 -> mouseY 7.
    // relativeX = 15 - 10 = 5
    // relativeY = 7 - 5 = 2
    callback({ name: 'left-press', col: 16, row: 8 });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'left-press' }),
      5,
      2,
    );
  });

  it('should not call handler when click is outside bounds', () => {
    vi.mocked(getBoundingBox).mockReturnValue({
      x: 10,
      y: 5,
      width: 20,
      height: 10,
    } as unknown as ReturnType<typeof getBoundingBox>);

    renderHook(() => useMouseClick(containerRef, handler));
    const callback = mockUseMouse.mock.calls[0][0];

    // Click outside: x=5 (col 6), y=7 (row 8) -> left of box
    callback({ name: 'left-press', col: 6, row: 8 });
    expect(handler).not.toHaveBeenCalled();
  });
});
