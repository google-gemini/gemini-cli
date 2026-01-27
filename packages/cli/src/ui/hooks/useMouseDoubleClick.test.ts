/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useMouseDoubleClick } from './useMouseDoubleClick.js';
import * as MouseContext from '../contexts/MouseContext.js';
import type { MouseEvent } from '../contexts/MouseContext.js';
import type { DOMElement } from 'ink';

describe('useMouseDoubleClick', () => {
  const mockHandler = vi.fn();
  const mockContainerRef = {
    current: {} as DOMElement,
  };

  // Mock getBoundingBox from ink
  vi.mock('ink', async () => {
    const actual = await vi.importActual('ink');
    return {
      ...actual,
      getBoundingBox: () => ({ x: 0, y: 0, width: 80, height: 24 }),
    };
  });

  let mouseCallback: (event: MouseEvent) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock useMouse to capture the callback
    vi.spyOn(MouseContext, 'useMouse').mockImplementation((callback) => {
      mouseCallback = callback;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should detect double-click within threshold', async () => {
    renderHook(() => useMouseDoubleClick(mockContainerRef, mockHandler));

    const event1: MouseEvent = {
      name: 'left-press',
      col: 10,
      row: 5,
      shift: false,
      meta: false,
      ctrl: false,
      button: 'left',
    };
    const event2: MouseEvent = {
      name: 'left-press',
      col: 10,
      row: 5,
      shift: false,
      meta: false,
      ctrl: false,
      button: 'left',
    };
    await act(async () => {
      mouseCallback(event1);
      vi.advanceTimersByTime(200);
      mouseCallback(event2);
    });

    expect(mockHandler).toHaveBeenCalledWith(event2, 9, 4);
  });

  it('should NOT detect double-click if time exceeds threshold', async () => {
    renderHook(() => useMouseDoubleClick(mockContainerRef, mockHandler));

    const event1: MouseEvent = {
      name: 'left-press',
      col: 10,
      row: 5,
      shift: false,
      meta: false,
      ctrl: false,
      button: 'left',
    };
    const event2: MouseEvent = {
      name: 'left-press',
      col: 10,
      row: 5,
      shift: false,
      meta: false,
      ctrl: false,
      button: 'left',
    };

    await act(async () => {
      mouseCallback(event1);
      vi.advanceTimersByTime(500); // Threshold is 400ms
      mouseCallback(event2);
    });

    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should NOT detect double-click if distance exceeds tolerance', async () => {
    renderHook(() => useMouseDoubleClick(mockContainerRef, mockHandler));

    const event1: MouseEvent = {
      name: 'left-press',
      col: 10,
      row: 5,
      shift: false,
      meta: false,
      ctrl: false,
      button: 'left',
    };
    const event2: MouseEvent = {
      name: 'left-press',
      col: 15,
      row: 10,
      shift: false,
      meta: false,
      ctrl: false,
      button: 'left',
    };

    await act(async () => {
      mouseCallback(event1);
      vi.advanceTimersByTime(200);
      mouseCallback(event2);
    });

    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should respect isActive option', () => {
    renderHook(() =>
      useMouseDoubleClick(mockContainerRef, mockHandler, { isActive: false }),
    );

    expect(MouseContext.useMouse).toHaveBeenCalledWith(expect.any(Function), {
      isActive: false,
    });
  });
});
