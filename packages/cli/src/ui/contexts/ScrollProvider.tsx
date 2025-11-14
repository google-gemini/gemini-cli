/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getBoundingBox, type DOMElement } from 'ink';
import { useMouse, type MouseEvent } from '../hooks/useMouse.js';

export interface ScrollState {
  scrollTop: number;
  scrollHeight: number;
  innerHeight: number;
}

export interface ScrollableEntry {
  id: string;
  ref: React.RefObject<DOMElement>;
  getScrollState: () => ScrollState;
  scrollBy: (delta: number) => void;
  scrollTo?: (scrollTop: number, duration?: number) => void;
  hasFocus: () => boolean;
  flashScrollbar: () => void;
}

interface ScrollContextType {
  register: (entry: ScrollableEntry) => void;
  unregister: (id: string) => void;
}

const ScrollContext = createContext<ScrollContextType | null>(null);

const findScrollableCandidates = (
  mouseEvent: MouseEvent,
  scrollables: Map<string, ScrollableEntry>,
) => {
  const candidates: Array<ScrollableEntry & { area: number }> = [];

  for (const entry of scrollables.values()) {
    if (!entry.ref.current || !entry.hasFocus()) {
      continue;
    }

    const boundingBox = getBoundingBox(entry.ref.current);
    if (!boundingBox) continue;

    const { x, y, width, height } = boundingBox;

    const isInside =
      mouseEvent.col >= x &&
      mouseEvent.col < x + width + 1 && // Intentionally add one to width to include scrollbar.
      mouseEvent.row >= y &&
      mouseEvent.row < y + height;

    if (isInside) {
      candidates.push({ ...entry, area: width * height });
    }
  }

  // Sort by smallest area first
  candidates.sort((a, b) => a.area - b.area);
  return candidates;
};

export const ScrollProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [scrollables, setScrollables] = useState(
    new Map<string, ScrollableEntry>(),
  );

  const register = useCallback((entry: ScrollableEntry) => {
    setScrollables((prev) => new Map(prev).set(entry.id, entry));
  }, []);

  const unregister = useCallback((id: string) => {
    setScrollables((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const scrollablesRef = useRef(scrollables);
  useEffect(() => {
    scrollablesRef.current = scrollables;
  }, [scrollables]);

  const pendingScrollsRef = useRef(new Map<string, number>());
  const flushScheduledRef = useRef(false);

  const dragStateRef = useRef<{
    active: boolean;
    id: string | null;
    offset: number;
  }>({
    active: false,
    id: null,
    offset: 0,
  });

  const scheduleFlush = useCallback(() => {
    if (!flushScheduledRef.current) {
      flushScheduledRef.current = true;
      setTimeout(() => {
        flushScheduledRef.current = false;
        for (const [id, delta] of pendingScrollsRef.current.entries()) {
          const entry = scrollablesRef.current.get(id);
          if (entry) {
            entry.scrollBy(delta);
          }
        }
        pendingScrollsRef.current.clear();
      }, 0);
    }
  }, []);

  const handleScroll = (direction: 'up' | 'down', mouseEvent: MouseEvent) => {
    const delta = direction === 'up' ? -1 : 1;
    const candidates = findScrollableCandidates(
      mouseEvent,
      scrollablesRef.current,
    );

    for (const candidate of candidates) {
      const { scrollTop, scrollHeight, innerHeight } =
        candidate.getScrollState();
      const pendingDelta = pendingScrollsRef.current.get(candidate.id) || 0;
      const effectiveScrollTop = scrollTop + pendingDelta;

      // Epsilon to handle floating point inaccuracies.
      const canScrollUp = effectiveScrollTop > 0.001;
      const canScrollDown =
        effectiveScrollTop < scrollHeight - innerHeight - 0.001;

      if (direction === 'up' && canScrollUp) {
        pendingScrollsRef.current.set(candidate.id, pendingDelta + delta);
        scheduleFlush();
        return true;
      }

      if (direction === 'down' && canScrollDown) {
        pendingScrollsRef.current.set(candidate.id, pendingDelta + delta);
        scheduleFlush();
        return true;
      }
    }
    return false;
  };

  const handleLeftPress = (mouseEvent: MouseEvent) => {
    // Check for scrollbar interaction first
    for (const entry of scrollablesRef.current.values()) {
      if (!entry.ref.current || !entry.hasFocus()) {
        continue;
      }

      const boundingBox = getBoundingBox(entry.ref.current);
      if (!boundingBox) continue;

      const { x, y, width, height } = boundingBox;

      // Check if click is on the scrollbar column (x + width)
      // The findScrollableCandidates logic implies scrollbar is at x + width.
      if (
        mouseEvent.col === x + width &&
        mouseEvent.row >= y &&
        mouseEvent.row < y + height
      ) {
        const { scrollTop, scrollHeight, innerHeight } = entry.getScrollState();

        if (scrollHeight <= innerHeight) continue;

        const thumbHeight = Math.max(
          1,
          Math.floor((innerHeight / scrollHeight) * innerHeight),
        );
        const maxScrollTop = scrollHeight - innerHeight;
        const maxThumbY = innerHeight - thumbHeight;

        if (maxThumbY <= 0) continue;

        const currentThumbY = Math.round(
          (scrollTop / maxScrollTop) * maxThumbY,
        );

        const absoluteThumbTop = y + currentThumbY;
        const absoluteThumbBottom = absoluteThumbTop + thumbHeight;

        const isTop = mouseEvent.row === y;
        const isBottom = mouseEvent.row === y + height - 1;

        const hitTop = isTop ? absoluteThumbTop : absoluteThumbTop - 1;
        const hitBottom = isBottom
          ? absoluteThumbBottom
          : absoluteThumbBottom + 1;

        const isThumbClick =
          mouseEvent.row >= hitTop && mouseEvent.row < hitBottom;

        let offset = 0;
        const relativeMouseY = mouseEvent.row - y;

        if (isThumbClick) {
          offset = relativeMouseY - currentThumbY;
        } else {
          // Track click - Jump to position
          // Center the thumb on the mouse click
          const targetThumbY = Math.max(
            0,
            Math.min(maxThumbY, relativeMouseY - Math.floor(thumbHeight / 2)),
          );

          const newScrollTop = Math.round(
            (targetThumbY / maxThumbY) * maxScrollTop,
          );
          if (entry.scrollTo) {
            entry.scrollTo(newScrollTop);
          } else {
            entry.scrollBy(newScrollTop - scrollTop);
          }

          offset = relativeMouseY - targetThumbY;
        }

        // Start drag (for both thumb and track clicks)
        dragStateRef.current = {
          active: true,
          id: entry.id,
          offset,
        };
        return true;
      }
    }

    const candidates = findScrollableCandidates(
      mouseEvent,
      scrollablesRef.current,
    );

    if (candidates.length > 0) {
      // The first candidate is the innermost one.
      candidates[0].flashScrollbar();
      // We don't consider just flashing the scrollbar as handling the event
      // in a way that should prevent other handlers (like drag warning)
      // from checking it, although for left-press it doesn't matter much.
      // But returning false is safer.
      return false;
    }
    return false;
  };

  const handleMove = (mouseEvent: MouseEvent) => {
    const state = dragStateRef.current;
    if (!state.active || !state.id) return false;

    const entry = scrollablesRef.current.get(state.id);
    if (!entry || !entry.ref.current) {
      state.active = false;
      return false;
    }

    const boundingBox = getBoundingBox(entry.ref.current);
    if (!boundingBox) return false;

    const { y } = boundingBox;
    const { scrollTop, scrollHeight, innerHeight } = entry.getScrollState();

    const thumbHeight = Math.max(
      1,
      Math.floor((innerHeight / scrollHeight) * innerHeight),
    );
    const maxScrollTop = scrollHeight - innerHeight;
    const maxThumbY = innerHeight - thumbHeight;

    if (maxThumbY <= 0) return false;

    const relativeMouseY = mouseEvent.row - y;
    // Calculate the target thumb position based on the mouse position and the offset.
    // We clamp it to the valid range [0, maxThumbY].
    const targetThumbY = Math.max(
      0,
      Math.min(maxThumbY, relativeMouseY - state.offset),
    );

    const targetScrollTop = Math.round(
      (targetThumbY / maxThumbY) * maxScrollTop,
    );

    if (entry.scrollTo) {
      entry.scrollTo(targetScrollTop, 0);
    } else {
      entry.scrollBy(targetScrollTop - scrollTop);
    }
    return true;
  };

  const handleLeftRelease = () => {
    if (dragStateRef.current.active) {
      dragStateRef.current = {
        active: false,
        id: null,
        offset: 0,
      };
      return true;
    }
    return false;
  };

  useMouse(
    (event: MouseEvent) => {
      if (event.name === 'scroll-up') {
        return handleScroll('up', event);
      } else if (event.name === 'scroll-down') {
        return handleScroll('down', event);
      } else if (event.name === 'left-press') {
        return handleLeftPress(event);
      } else if (event.name === 'move') {
        return handleMove(event);
      } else if (event.name === 'left-release') {
        return handleLeftRelease();
      }
      return false;
    },
    { isActive: true },
  );

  const contextValue = useMemo(
    () => ({ register, unregister }),
    [register, unregister],
  );

  return (
    <ScrollContext.Provider value={contextValue}>
      {children}
    </ScrollContext.Provider>
  );
};

let nextId = 0;

export const useScrollable = (
  entry: Omit<ScrollableEntry, 'id'>,
  isActive: boolean,
) => {
  const context = useContext(ScrollContext);
  if (!context) {
    throw new Error('useScrollable must be used within a ScrollProvider');
  }

  const [id] = useState(() => `scrollable-${nextId++}`);

  useEffect(() => {
    if (isActive) {
      context.register({ ...entry, id });
      return () => {
        context.unregister(id);
      };
    }
    return;
  }, [context, entry, id, isActive]);
};
