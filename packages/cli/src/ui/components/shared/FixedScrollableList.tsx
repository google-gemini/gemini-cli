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
  useEffect,
  useContext,
  useLayoutEffect,
} from 'react';
import type React from 'react';
import {
  FixedVirtualizedList,
  type FixedVirtualizedListRef,
  type FixedVirtualizedListProps,
  SCROLL_TO_ITEM_END,
} from './FixedVirtualizedList.js';
import { useScrollable } from '../../contexts/ScrollProvider.js';
import { Box, type DOMElement } from 'ink';
import { useAnimatedScrollbar } from '../../hooks/useAnimatedScrollbar.js';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { Command } from '../../key/keyMatchers.js';
import { useKeyMatchers } from '../../hooks/useKeyMatchers.js';
import { useSettings } from '../../contexts/SettingsContext.js';
import { VirtualizedListContext } from './VirtualizedList.js';

const ANIMATION_FRAME_DURATION_MS = 33;

interface FixedScrollableListProps<T> extends FixedVirtualizedListProps<T> {
  itemKey?: string;
  hasFocus: boolean;
  width: number;
  scrollbar?: boolean;
  stableScrollback?: boolean;
  isStatic?: boolean;
  fixedItemHeight?: boolean;
  targetScrollIndex?: number;
  scrollbarThumbColor?: string;
}

export type FixedScrollableListRef<T> = FixedVirtualizedListRef<T>;

function FixedScrollableList<T>(
  props: FixedScrollableListProps<T>,
  ref: React.Ref<FixedScrollableListRef<T>>,
) {
  const keyMatchers = useKeyMatchers();
  const settings = useSettings();
  const maxScrollbackLength = settings.merged.ui?.maxScrollbackLength;
  const {
    itemKey,
    hasFocus,
    width,
    maxHeight,
    scrollbar = true,
    stableScrollback,
  } = props;
  const fixedVirtualizedListRef = useRef<FixedVirtualizedListRef<T>>(null);
  const containerRef = useRef<DOMElement>(null);

  const virtualizedListContext = useContext(VirtualizedListContext);

  useLayoutEffect(() => {
    if (itemKey && virtualizedListContext) {
      const restoredTop = virtualizedListContext.getItemState(
        itemKey,
        'scrollTop',
      );
      if (typeof restoredTop === 'number') {
        fixedVirtualizedListRef.current?.scrollTo(restoredTop);
      }
    }
  }, [itemKey, virtualizedListContext]);

  useEffect(
    () => () => {
      if (itemKey && virtualizedListContext) {
        const top = fixedVirtualizedListRef.current?.getScrollState().scrollTop;
        if (top !== undefined) {
          virtualizedListContext.setItemState(itemKey, 'scrollTop', top);
        }
      }
    },
    [itemKey, virtualizedListContext],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollBy: (delta) => fixedVirtualizedListRef.current?.scrollBy(delta),
      scrollTo: (offset) => fixedVirtualizedListRef.current?.scrollTo(offset),
      scrollToEnd: () => fixedVirtualizedListRef.current?.scrollToEnd(),
      scrollToIndex: (params) =>
        fixedVirtualizedListRef.current?.scrollToIndex(params),
      scrollToItem: (params) =>
        fixedVirtualizedListRef.current?.scrollToItem(params),
      getScrollIndex: () =>
        fixedVirtualizedListRef.current?.getScrollIndex() ?? 0,
      getScrollState: () =>
        fixedVirtualizedListRef.current?.getScrollState() ?? {
          scrollTop: 0,
          scrollHeight: 0,
          innerHeight: 0,
        },
    }),
    [],
  );

  const getScrollState = useCallback(
    () =>
      fixedVirtualizedListRef.current?.getScrollState() ?? {
        scrollTop: 0,
        scrollHeight: 0,
        innerHeight: 0,
      },
    [],
  );

  const scrollBy = useCallback((delta: number) => {
    fixedVirtualizedListRef.current?.scrollBy(delta);
  }, []);

  const { scrollbarColor, flashScrollbar, scrollByWithAnimation } =
    useAnimatedScrollbar(hasFocus, scrollBy);

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

  useEffect(() => stopSmoothScroll, [stopSmoothScroll]);

  const smoothScrollTo = useCallback(
    (
      targetScrollTop: number,
      duration: number = process.env['NODE_ENV'] === 'test' ? 0 : 200,
    ) => {
      stopSmoothScroll();

      const scrollState = fixedVirtualizedListRef.current?.getScrollState() ?? {
        scrollTop: 0,
        scrollHeight: 0,
        innerHeight: 0,
      };
      const {
        scrollTop: rawStartScrollTop,
        scrollHeight,
        innerHeight,
      } = scrollState;

      const maxScrollTop = Math.max(0, scrollHeight - innerHeight);
      const startScrollTop = Math.min(rawStartScrollTop, maxScrollTop);

      let effectiveTarget = targetScrollTop;
      if (
        targetScrollTop === SCROLL_TO_ITEM_END ||
        targetScrollTop >= maxScrollTop
      ) {
        effectiveTarget = maxScrollTop;
      }

      const clampedTarget = Math.max(
        0,
        Math.min(maxScrollTop, effectiveTarget),
      );

      if (duration === 0) {
        if (
          targetScrollTop === SCROLL_TO_ITEM_END ||
          targetScrollTop >= maxScrollTop
        ) {
          fixedVirtualizedListRef.current?.scrollTo(Number.MAX_SAFE_INTEGER);
        } else {
          fixedVirtualizedListRef.current?.scrollTo(Math.round(clampedTarget));
        }
        flashScrollbar();
        return;
      }

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

          if (progress >= 1) {
            if (
              targetScrollTop === SCROLL_TO_ITEM_END ||
              targetScrollTop >= maxScrollTop
            ) {
              fixedVirtualizedListRef.current?.scrollTo(
                Number.MAX_SAFE_INTEGER,
              );
            } else {
              fixedVirtualizedListRef.current?.scrollTo(Math.round(current));
            }
            stopSmoothScroll();
            flashScrollbar();
          } else {
            fixedVirtualizedListRef.current?.scrollTo(Math.round(current));
          }
        }, ANIMATION_FRAME_DURATION_MS),
      };
    },
    [stopSmoothScroll, flashScrollbar],
  );

  useKeypress(
    (key: Key) => {
      if (keyMatchers[Command.SCROLL_UP](key)) {
        stopSmoothScroll();
        scrollByWithAnimation(-1);
        return true;
      } else if (keyMatchers[Command.SCROLL_DOWN](key)) {
        stopSmoothScroll();
        scrollByWithAnimation(1);
        return true;
      } else if (
        keyMatchers[Command.PAGE_UP](key) ||
        keyMatchers[Command.PAGE_DOWN](key)
      ) {
        const direction = keyMatchers[Command.PAGE_UP](key) ? -1 : 1;
        const scrollState = getScrollState();
        const maxScroll = Math.max(
          0,
          scrollState.scrollHeight - scrollState.innerHeight,
        );
        const current = smoothScrollState.current.active
          ? smoothScrollState.current.to
          : Math.min(scrollState.scrollTop, maxScroll);
        const innerHeight = scrollState.innerHeight;
        smoothScrollTo(current + direction * innerHeight);
        return true;
      } else if (keyMatchers[Command.SCROLL_HOME](key)) {
        smoothScrollTo(0);
        return true;
      } else if (keyMatchers[Command.SCROLL_END](key)) {
        smoothScrollTo(SCROLL_TO_ITEM_END);
        return true;
      }
      return false;
    },
    { isActive: hasFocus },
  );

  const hasFocusCallback = useCallback(() => hasFocus, [hasFocus]);

  const scrollableEntry = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      ref: containerRef as React.RefObject<DOMElement>,
      getScrollState,
      scrollBy: scrollByWithAnimation,
      scrollTo: smoothScrollTo,
      hasFocus: hasFocusCallback,
      flashScrollbar,
    }),
    [
      getScrollState,
      hasFocusCallback,
      flashScrollbar,
      scrollByWithAnimation,
      smoothScrollTo,
    ],
  );

  useScrollable(scrollableEntry, true);

  return (
    <Box
      ref={containerRef}
      flexGrow={1}
      flexDirection="column"
      width={width}
      maxHeight={maxHeight}
    >
      <FixedVirtualizedList
        ref={fixedVirtualizedListRef}
        {...props}
        scrollbar={scrollbar}
        scrollbarThumbColor={scrollbarColor}
        stableScrollback={stableScrollback}
        maxScrollbackLength={maxScrollbackLength}
      />
    </Box>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const FixedScrollableListWithForwardRef = forwardRef(FixedScrollableList) as <
  T,
>(
  props: FixedScrollableListProps<T> & {
    ref?: React.Ref<FixedScrollableListRef<T>>;
  },
) => React.ReactElement;

export { FixedScrollableListWithForwardRef as FixedScrollableList };
