/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useMemo,
} from 'react';
import type React from 'react';
import { VirtualizedList, type VirtualizedListRef } from './VirtualizedList.js';
import { useScrollable } from '../../contexts/ScrollProvider.js';
import { Box, type DOMElement } from 'ink';
import { useAnimatedScrollbar } from '../../hooks/useAnimatedScrollbar.js';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { useScrollSettings } from '../../hooks/useScrollSettings.js';

type VirtualizedListProps<T> = {
  data: T[];
  renderItem: (info: { item: T; index: number }) => React.ReactElement;
  estimatedItemHeight: (index: number) => number;
  keyExtractor: (item: T, index: number) => string;
  initialScrollIndex?: number;
  initialScrollOffsetInIndex?: number;
};

interface ScrollableListProps<T> extends VirtualizedListProps<T> {
  hasFocus: boolean;
}

export type ScrollableListRef<T> = VirtualizedListRef<T>;

function ScrollableList<T>(
  props: ScrollableListProps<T>,
  ref: React.Ref<ScrollableListRef<T>>,
) {
  const { hasFocus } = props;
  const virtualizedListRef = useRef<VirtualizedListRef<T>>(null);
  const containerRef = useRef<DOMElement>(null);
  const { scrollAccelerationDuration, maxScrollSpeedFraction } =
    useScrollSettings();

  const accelerationState = useRef({
    lastTime: 0,
    sequenceStartTime: 0,
    lastDirection: 0, // -1, 0, 1
    velocity: 0,
  });

  useImperativeHandle(
    ref,
    () => ({
      scrollBy: (delta) => virtualizedListRef.current?.scrollBy(delta),
      scrollTo: (offset) => virtualizedListRef.current?.scrollTo(offset),
      scrollToEnd: () => virtualizedListRef.current?.scrollToEnd(),
      scrollToIndex: (params) =>
        virtualizedListRef.current?.scrollToIndex(params),
      scrollToItem: (params) =>
        virtualizedListRef.current?.scrollToItem(params),
      getScrollIndex: () => virtualizedListRef.current?.getScrollIndex() ?? 0,
      getScrollState: () =>
        virtualizedListRef.current?.getScrollState() ?? {
          scrollTop: 0,
          scrollHeight: 0,
          innerHeight: 0,
        },
    }),
    [],
  );

  const getScrollState = useCallback(
    () =>
      virtualizedListRef.current?.getScrollState() ?? {
        scrollTop: 0,
        scrollHeight: 0,
        innerHeight: 0,
      },
    [],
  );

  const scrollBy = useCallback((delta: number) => {
    virtualizedListRef.current?.scrollBy(delta);
  }, []);

  const { scrollbarColor, flashScrollbar, scrollByWithAnimation } =
    useAnimatedScrollbar(hasFocus, scrollBy);

  const scrollByWithAcceleration = useCallback(
    (delta: number) => {
      const now = Date.now();
      const state = accelerationState.current;
      const direction = Math.sign(delta);
      const dt = now - state.lastTime;
      state.lastTime = now;

      const KEY_REPEAT_DELAY = 400;
      const DECAY_COEFFICIENT = 0.1; // 90% loss
      const DECAY_DURATION = 1000; // over 1 second

      // 1. Check direction change
      if (direction !== state.lastDirection) {
        state.velocity = 0;
        state.lastDirection = direction;
      } else {
        // 2. Apply Decay if needed
        if (dt > KEY_REPEAT_DELAY) {
          const decayTime = dt - KEY_REPEAT_DELAY;
          const decayFactor = Math.pow(
            DECAY_COEFFICIENT,
            decayTime / DECAY_DURATION,
          );
          state.velocity *= decayFactor;
          if (state.velocity < 1) {
            state.velocity = 0;
          }
        }
      }

      // 3. Calculate Acceleration Parameters
      const scrollHeight =
        virtualizedListRef.current?.getScrollState().scrollHeight ?? 1000;
      const maxSpeed = scrollHeight * maxScrollSpeedFraction; // pixels/sec
      const accelRate = maxSpeed / scrollAccelerationDuration; // pixels/sec^2

      // 4. Apply Acceleration
      // If dt > KEY_REPEAT_DELAY, we treat it as a fresh press (or restart after pause),
      // so we use a standard "tick" duration (50ms) instead of the full elapsed time.
      // Otherwise, we use the actual elapsed time (clamped to 100ms) to maintain smooth acceleration.
      const effectiveDt = dt > KEY_REPEAT_DELAY ? 50 : Math.min(dt, 100);

      state.velocity += accelRate * effectiveDt;
      state.velocity = Math.min(state.velocity, maxSpeed);

      // 5. Calculate Distance
      // Distance = Velocity * Time.
      const accelDist = state.velocity * (effectiveDt / 1000);
      const baseDist = Math.abs(delta);
      // Ensure we move at least the base delta (1 unit)
      const finalDist = Math.round(Math.max(baseDist, accelDist));

      scrollByWithAnimation(direction * finalDist);
    },
    [maxScrollSpeedFraction, scrollAccelerationDuration, scrollByWithAnimation],
  );

  const smoothScrollState = useRef<{
    active: boolean;
    start: number;
    from: number;
    to: number;
    duration: number;
    timer: NodeJS.Timeout | null;
  }>({ active: false, start: 0, from: 0, to: 0, duration: 0, timer: null });

  const stopSmoothScroll = useCallback(() => {
    if (smoothScrollState.current.timer) {
      clearInterval(smoothScrollState.current.timer);
      smoothScrollState.current.timer = null;
    }
    smoothScrollState.current.active = false;
  }, []);

  const smoothScrollTo = useCallback(
    (targetScrollTop: number, duration: number = 200) => {
      stopSmoothScroll();

      const startScrollTop =
        virtualizedListRef.current?.getScrollState().scrollTop ?? 0;
      const scrollHeight =
        virtualizedListRef.current?.getScrollState().scrollHeight ?? 0;
      const innerHeight =
        virtualizedListRef.current?.getScrollState().innerHeight ?? 0;
      const maxScrollTop = Math.max(0, scrollHeight - innerHeight);
      const clampedTarget = Math.max(
        0,
        Math.min(maxScrollTop, targetScrollTop),
      );

      smoothScrollState.current = {
        active: true,
        start: Date.now(),
        from: startScrollTop,
        to: clampedTarget,
        duration,
        timer: setInterval(() => {
          const now = Date.now();
          const elapsed = now - smoothScrollState.current.start;
          const progress = Math.min(elapsed / duration, 1);

          // Ease-in-out
          const t = progress;
          const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

          const current =
            smoothScrollState.current.from +
            (smoothScrollState.current.to - smoothScrollState.current.from) *
              ease;

          virtualizedListRef.current?.scrollTo(Math.round(current));

          if (progress >= 1) {
            stopSmoothScroll();
            flashScrollbar();
          }
        }, 33),
      };
    },
    [stopSmoothScroll, flashScrollbar],
  );

  useKeypress(
    (key: Key) => {
      if (key.name === 'up') {
        stopSmoothScroll();
        if (key.shift) {
          scrollByWithAnimation(-1);
        }
      } else if (key.name === 'down') {
        stopSmoothScroll();
        if (key.shift) {
          scrollByWithAnimation(1);
        }
      } else if (key.name === 'pageup') {
        const current = smoothScrollState.current.active
          ? smoothScrollState.current.to
          : (virtualizedListRef.current?.getScrollState().scrollTop ?? 0);
        const innerHeight =
          virtualizedListRef.current?.getScrollState().innerHeight ?? 0;
        smoothScrollTo(current - innerHeight);
      } else if (key.name === 'pagedown') {
        const current = smoothScrollState.current.active
          ? smoothScrollState.current.to
          : (virtualizedListRef.current?.getScrollState().scrollTop ?? 0);
        const innerHeight =
          virtualizedListRef.current?.getScrollState().innerHeight ?? 0;
        smoothScrollTo(current + innerHeight);
      } else if (key.name === 'home') {
        stopSmoothScroll();
        virtualizedListRef.current?.scrollTo(0);
        flashScrollbar();
      } else if (key.name === 'end') {
        stopSmoothScroll();
        virtualizedListRef.current?.scrollToEnd();
        flashScrollbar();
      } else {
        // Reset acceleration on other keys
        accelerationState.current.velocity = 0;
        accelerationState.current.lastDirection = 0;
        stopSmoothScroll();
      }
    },
    { isActive: hasFocus },
  );

  const hasFocusCallback = useCallback(() => hasFocus, [hasFocus]);

  const scrollableEntry = useMemo(
    () => ({
      ref: containerRef as React.RefObject<DOMElement>,
      getScrollState,
      scrollBy: scrollByWithAcceleration,
      hasFocus: hasFocusCallback,
      flashScrollbar,
    }),
    [
      getScrollState,
      scrollByWithAcceleration,
      hasFocusCallback,
      flashScrollbar,
    ],
  );

  useScrollable(scrollableEntry, hasFocus);

  return (
    <Box
      ref={containerRef}
      flexGrow={1}
      flexDirection="column"
      overflow="hidden"
    >
      <VirtualizedList
        ref={virtualizedListRef}
        {...props}
        scrollbarThumbColor={scrollbarColor}
      />
    </Box>
  );
}

const ScrollableListWithForwardRef = forwardRef(ScrollableList) as <T>(
  props: ScrollableListProps<T> & { ref?: React.Ref<ScrollableListRef<T>> },
) => React.ReactElement;

export { ScrollableListWithForwardRef as ScrollableList };
