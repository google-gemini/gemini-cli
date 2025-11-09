/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import {
  ScrollProvider,
  useScrollable,
  type ScrollState,
} from './ScrollProvider.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRef, useImperativeHandle, forwardRef, type RefObject } from 'react';
import { Box, type DOMElement } from 'ink';
import type { MouseEvent } from '../hooks/useMouse.js';

// Mock useMouse hook
const mockUseMouseCallbacks = new Set<(event: MouseEvent) => void>();
vi.mock('../hooks/useMouse.js', async () => {
  // We need to import React dynamically because this factory runs before top-level imports
  const React = await import('react');
  return {
    useMouse: (callback: (event: MouseEvent) => void) => {
      React.useEffect(() => {
        mockUseMouseCallbacks.add(callback);
        return () => {
          mockUseMouseCallbacks.delete(callback);
        };
      }, [callback]);
    },
  };
});

// Mock ink's getBoundingBox
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    getBoundingBox: vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 })),
  };
});

const TestScrollable = forwardRef(
  (
    props: {
      id: string;
      scrollBy: (delta: number) => void;
      getScrollState: () => ScrollState;
    },
    ref,
  ) => {
    const elementRef = useRef<DOMElement>(null);
    useImperativeHandle(ref, () => elementRef.current);

    useScrollable(
      {
        ref: elementRef as RefObject<DOMElement>,
        getScrollState: props.getScrollState,
        scrollBy: props.scrollBy,
        hasFocus: () => true,
        flashScrollbar: () => {},
      },
      true,
    );

    return <Box ref={elementRef} />;
  },
);
TestScrollable.displayName = 'TestScrollable';

describe('ScrollProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseMouseCallbacks.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches multiple scroll events into a single update', async () => {
    const scrollBy = vi.fn();
    const getScrollState = vi.fn(() => ({
      scrollTop: 0,
      scrollHeight: 100,
      innerHeight: 10,
    }));

    render(
      <ScrollProvider>
        <TestScrollable
          id="test-scrollable"
          scrollBy={scrollBy}
          getScrollState={getScrollState}
        />
      </ScrollProvider>,
    );

    // Simulate multiple scroll events
    const mouseEvent: MouseEvent = {
      name: 'scroll-down',
      col: 5,
      row: 5,
      shift: false,
      ctrl: false,
      meta: false,
    };
    for (const callback of mockUseMouseCallbacks) {
      callback(mouseEvent);
      callback(mouseEvent);
      callback(mouseEvent);
    }

    // Should not have called scrollBy yet
    expect(scrollBy).not.toHaveBeenCalled();

    // Advance timers to trigger the batched update
    await vi.runAllTimersAsync();

    // Should have called scrollBy once with accumulated delta (3)
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith(3);
  });

  it('handles mixed direction scroll events in batch', async () => {
    const scrollBy = vi.fn();
    const getScrollState = vi.fn(() => ({
      scrollTop: 10,
      scrollHeight: 100,
      innerHeight: 10,
    }));

    render(
      <ScrollProvider>
        <TestScrollable
          id="test-scrollable"
          scrollBy={scrollBy}
          getScrollState={getScrollState}
        />
      </ScrollProvider>,
    );

    // Simulate mixed scroll events: down (1), down (1), up (-1)
    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'scroll-down',
        col: 5,
        row: 5,
        shift: false,
        ctrl: false,
        meta: false,
      });
      callback({
        name: 'scroll-down',
        col: 5,
        row: 5,
        shift: false,
        ctrl: false,
        meta: false,
      });
      callback({
        name: 'scroll-up',
        col: 5,
        row: 5,
        shift: false,
        ctrl: false,
        meta: false,
      });
    }

    expect(scrollBy).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith(1); // 1 + 1 - 1 = 1
  });

  it('respects scroll limits during batching', async () => {
    const scrollBy = vi.fn();
    // Start near bottom
    const getScrollState = vi.fn(() => ({
      scrollTop: 89,
      scrollHeight: 100,
      innerHeight: 10,
    }));

    render(
      <ScrollProvider>
        <TestScrollable
          id="test-scrollable"
          scrollBy={scrollBy}
          getScrollState={getScrollState}
        />
      </ScrollProvider>,
    );

    // Try to scroll down 3 times, but only 1 is allowed before hitting bottom
    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'scroll-down',
        col: 5,
        row: 5,
        shift: false,
        ctrl: false,
        meta: false,
      });
      callback({
        name: 'scroll-down',
        col: 5,
        row: 5,
        shift: false,
        ctrl: false,
        meta: false,
      });
      callback({
        name: 'scroll-down',
        col: 5,
        row: 5,
        shift: false,
        ctrl: false,
        meta: false,
      });
    }

    await vi.runAllTimersAsync();

    // Should have accumulated only 1, because subsequent scrolls would be blocked
    // Actually, the logic in ScrollProvider uses effectiveScrollTop to check bounds.
    // scrollTop=89, max=90.
    // 1st scroll: pending=1, effective=90. Allowed.
    // 2nd scroll: pending=1, effective=90. canScrollDown checks effective < 90. 90 < 90 is false. Blocked.
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith(1);
  });
});
