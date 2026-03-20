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

describe('ScrollProvider Drag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseMouseCallbacks.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drags the scrollbar thumb', async () => {
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

    // Scrollbar at x + width = 10.
    // Height 10.
    // scrollHeight 100, innerHeight 10.
    // thumbHeight = 1.
    // maxScrollTop = 90. maxThumbY = 9. Ratio = 10.
    // Thumb at 0.

    // 1. Click on thumb (row 0)
    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'left-press',
        col: 10,
        row: 0,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'left',
      });
    }

    // 2. Move mouse to row 1
    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'move',
        col: 10, // col doesn't matter for move if dragging
        row: 1,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'left',
      });
    }

    // Delta row = 1. Delta scroll = 10.
    // scrollBy called with 10.
    expect(scrollBy).toHaveBeenCalledWith(10);

    // 3. Move mouse to row 2
    scrollBy.mockClear();
    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'move',
        col: 10,
        row: 2,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'left',
      });
    }

    // Delta row from start (0) is 2. Delta scroll = 20.
    // startScrollTop was 0. target 20.
    // scrollBy called with (20 - scrollTop). scrollTop is still 0 in mock.
    expect(scrollBy).toHaveBeenCalledWith(20);

    // 4. Release
    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'left-release',
        col: 10,
        row: 2,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'left',
      });
    }

    // 5. Move again - should not scroll
    scrollBy.mockClear();
    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'move',
        col: 10,
        row: 3,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'none',
      });
    }
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('jumps to position and starts drag when clicking track below thumb', async () => {
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

    // Thumb at 0. Click at 5.
    // thumbHeight 1.
    // targetThumbY = 5.
    // targetScrollTop = 50.

    // 1. Click on track below thumb
    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'left-press',
        col: 10,
        row: 5,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'left',
      });
    }

    // Should jump to 50 (delta 50)
    expect(scrollBy).toHaveBeenCalledWith(50);
    scrollBy.mockClear();

    // 2. Move mouse to 6 - should drag
    // Start drag captured at row 5, startScrollTop 50.
    // Move to 6. Delta row 1. Delta scroll 10.
    // Target = 60.
    // scrollBy called with 60 - 0 (current state still 0).
    // Note: In real app, state would update, but here getScrollState is static mock 0.

    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'move',
        col: 10,
        row: 6,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'left',
      });
    }

    expect(scrollBy).toHaveBeenCalledWith(60);
  });

  it('jumps to position when clicking track above thumb', async () => {
    const scrollBy = vi.fn();
    // Start scrolled down
    const getScrollState = vi.fn(() => ({
      scrollTop: 50,
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

    // Thumb at 5. Click at 2.
    // targetThumbY = 2.
    // targetScrollTop = 20.

    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'left-press',
        col: 10,
        row: 2,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'left',
      });
    }

    // Jump to 20 (delta = 20 - 50 = -30)
    expect(scrollBy).toHaveBeenCalledWith(-30);
  });

  it('jumps to top when clicking very top of track', async () => {
    const scrollBy = vi.fn();
    const getScrollState = vi.fn(() => ({
      scrollTop: 50,
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

    // Thumb at 5. Click at 0.
    // targetThumbY = 0.
    // targetScrollTop = 0.

    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'left-press',
        col: 10,
        row: 0,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'left',
      });
    }

    // Scroll to top (delta = 0 - 50 = -50)
    expect(scrollBy).toHaveBeenCalledWith(-50);
  });

  it('jumps to bottom when clicking very bottom of track', async () => {
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

    // Thumb at 0. Click at 9.
    // targetThumbY = 9.
    // targetScrollTop = 90.

    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'left-press',
        col: 10,
        row: 9,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'left',
      });
    }

    // Scroll to bottom (delta = 90 - 0 = 90)
    expect(scrollBy).toHaveBeenCalledWith(90);
  });

  it('uses scrollTo with 0 duration if provided', async () => {
    const scrollBy = vi.fn();
    const scrollTo = vi.fn();
    const getScrollState = vi.fn(() => ({
      scrollTop: 0,
      scrollHeight: 100,
      innerHeight: 10,
    }));

    // Custom component that provides scrollTo
    const TestScrollableWithScrollTo = forwardRef(
      (
        props: {
          id: string;
          scrollBy: (delta: number) => void;
          scrollTo: (scrollTop: number, duration?: number) => void;
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
            scrollTo: props.scrollTo,
            hasFocus: () => true,
            flashScrollbar: () => {},
          },
          true,
        );
        return <Box ref={elementRef} />;
      },
    );
    TestScrollableWithScrollTo.displayName = 'TestScrollableWithScrollTo';

    render(
      <ScrollProvider>
        <TestScrollableWithScrollTo
          id="test-scrollable-scrollto"
          scrollBy={scrollBy}
          scrollTo={scrollTo}
          getScrollState={getScrollState}
        />
      </ScrollProvider>,
    );

    // Click on track (jump)
    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'left-press',
        col: 10,
        row: 5,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'left',
      });
    }

    // Expect scrollTo to be called with target (and undefined/default duration)
    expect(scrollTo).toHaveBeenCalledWith(50);

    scrollTo.mockClear();

    // Move mouse (drag)
    for (const callback of mockUseMouseCallbacks) {
      callback({
        name: 'move',
        col: 10,
        row: 6,
        shift: false,
        ctrl: false,
        meta: false,
        button: 'left',
      });
    }
    // Expect scrollTo to be called with target and duration 0
    expect(scrollTo).toHaveBeenCalledWith(60, 0);
  });
});
