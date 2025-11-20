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
import { useSettings } from './SettingsContext.js';
import { debugLogger } from '@google/gemini-cli-core';

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

// To prevent scroll events from firing too quickly. 16ms is roughly 60fps.
const SCROLL_RATE_LIMIT_MS = 16;
// Determines the time window to consider a scroll "fast".
const FAST_SCROLL_THRESHOLD_MS = 50;
// The number of scroll events in the same direction that have to occur before
// we change the speed.
const MIN_CONSECUTIVE_FAST_SCROLLS = 4;
// The number of scroll events in the same direction that have to occur while
// scrolling fast before we reach the full scroll speed multiplier.
const SCROLL_ACCELERATION_EVENTS = 4;
// The duration of the smooth scroll animation.
const SCROLL_ANIMATION_DURATION_MS = 100;
// The time to wait before resetting the continuous scroll target.
const SCROLL_TARGET_RESET_TIMEOUT_MS = 150;

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

  const settings = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const lastScrollRateLimitTimeRef = useRef(0);
  const lastScrollEventTimeRef = useRef(0);

  const fastScrollCounterRef = useRef(1);
  const lastFastScrollDirectionRef = useRef<'up' | 'down' | null>(null);
  const lastMultiplierRef = useRef(1);

  const dragStateRef = useRef<{
    active: boolean;
    id: string | null;
    offset: number;
  }>({
    active: false,
    id: null,
    offset: 0,
  });

  const scrollTargetRef = useRef<number | null>(null);
  const scrollDirectionRef = useRef<'up' | 'down' | null>(null);
  const scrollResetTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleScroll = useCallback(
    (direction: 'up' | 'down', mouseEvent: MouseEvent) => {
      const scrollWheelSpeed =
        settingsRef.current.merged.ui?.scrollWheelSpeed ?? 5;

      const now = Date.now();
      if (now - lastScrollRateLimitTimeRef.current < SCROLL_RATE_LIMIT_MS) {
        return true; // Rate limit exceeded, consume event but do nothing.
      }
      lastScrollRateLimitTimeRef.current = now;

      const candidate = findScrollableCandidates(
        mouseEvent,
        scrollablesRef.current,
      )[0];
      if (!candidate) {
        return false;
      }

      const timeSinceLastScroll = now - lastScrollEventTimeRef.current;
      lastScrollEventTimeRef.current = now;

      if (
        lastFastScrollDirectionRef.current === direction &&
        timeSinceLastScroll < FAST_SCROLL_THRESHOLD_MS
      ) {
        fastScrollCounterRef.current++;
      } else {
        fastScrollCounterRef.current = 1;
        lastFastScrollDirectionRef.current = direction;
      }

      let multiplier = 1;
      const fastScrollCount = fastScrollCounterRef.current;
      const startAccelThreshold = MIN_CONSECUTIVE_FAST_SCROLLS;

      if (fastScrollCount >= startAccelThreshold) {
        const accelEvents = SCROLL_ACCELERATION_EVENTS;
        if (accelEvents > 0) {
          const stepsIntoAccel = fastScrollCount - startAccelThreshold;
          const progress = Math.min(1, (stepsIntoAccel + 1) / accelEvents);
          multiplier = 1 + (scrollWheelSpeed - 1) * progress;
        } else {
          multiplier = scrollWheelSpeed;
        }
      }

      if (multiplier > 1) {
        debugLogger.log(`Scroll speed factor: ${multiplier}`);
      } else if (lastMultiplierRef.current > 1 && multiplier === 1) {
        debugLogger.log('Scroll speed factor reset to 1');
      }
      lastMultiplierRef.current = multiplier;

      const scrollAmount = (direction === 'up' ? -1 : 1) * multiplier;

      const isAnimatedScroll =
        !!candidate.scrollTo && multiplier > 1 && scrollWheelSpeed > 1;

      if (!isAnimatedScroll) {
        candidate.scrollBy(scrollAmount);

        if (candidate.scrollTo) {
          // Reset animation state if we are switching back to non-animated.
          scrollTargetRef.current = null;
          scrollDirectionRef.current = null;
          if (scrollResetTimerRef.current) {
            clearTimeout(scrollResetTimerRef.current);
            scrollResetTimerRef.current = null;
          }
        }
        return true;
      }

      if (scrollResetTimerRef.current) {
        clearTimeout(scrollResetTimerRef.current);
      }

      const { scrollTop } = candidate.getScrollState();
      let currentTarget = scrollTargetRef.current;

      if (scrollDirectionRef.current !== direction || currentTarget === null) {
        currentTarget = scrollTop;
      }

      const newTarget = currentTarget + scrollAmount;

      scrollTargetRef.current = newTarget;
      scrollDirectionRef.current = direction;

      // We know scrollTo is defined because of the isAnimatedScroll check.
      if (candidate.scrollTo) {
        candidate.scrollTo(newTarget, SCROLL_ANIMATION_DURATION_MS);
      }

      scrollResetTimerRef.current = setTimeout(() => {
        scrollTargetRef.current = null;
        scrollDirectionRef.current = null;
      }, SCROLL_TARGET_RESET_TIMEOUT_MS);

      return true;
    },
    [],
  );

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
