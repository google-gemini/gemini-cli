/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { Box, type DOMElement, ResizeObserver } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { useScrollable } from '../../contexts/ScrollProvider.js';
import { useAnimatedScrollbar } from '../../hooks/useAnimatedScrollbar.js';
import { useBatchedScroll } from '../../hooks/useBatchedScroll.js';

interface ScrollableProps {
  children?: React.ReactNode;
  width?: number;
  height?: number | string;
  maxWidth?: number;
  maxHeight?: number;
  hasFocus: boolean;
  scrollToBottom?: boolean;
  flexGrow?: number;
}

export const Scrollable: React.FC<ScrollableProps> = ({
  children,
  width,
  height,
  maxWidth,
  maxHeight,
  hasFocus,
  scrollToBottom,
  flexGrow,
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [, setVersion] = useState(0);
  const ref = useRef<DOMElement>(null);
  const contentRef = useRef<DOMElement>(null);

  const layoutRef = useRef({
    innerHeight: 0,
    scrollHeight: 0,
    scrollTop: 0,
    childrenCount: React.Children.count(children),
  });

  const pendingSyncRef = useRef(false);

  const isFirstMeasureRef = useRef(true);

  const performSync = useCallback(() => {
    const {
      innerHeight,
      scrollHeight,
      scrollTop: currentScrollTop,
    } = layoutRef.current;
    const currentChildrenCount = React.Children.count(children);
    const prevChildrenCount = layoutRef.current.childrenCount;
    layoutRef.current.childrenCount = currentChildrenCount;

    const isAtBottom =
      layoutRef.current.innerHeight > 0 &&
      currentScrollTop >=
        layoutRef.current.scrollHeight - layoutRef.current.innerHeight - 1;

    let nextScrollTop = currentScrollTop;

    // Scroll to bottom if we were already at the bottom or if new children
    // were added and scrollToBottom is enabled. Also scroll to bottom on
    // the very first measure if scrollToBottom is enabled.
    if (
      isAtBottom ||
      (scrollToBottom &&
        (isFirstMeasureRef.current ||
          currentChildrenCount !== prevChildrenCount))
    ) {
      nextScrollTop = Math.max(0, scrollHeight - innerHeight);
    }

    if (innerHeight > 0) {
      isFirstMeasureRef.current = false;
    }

    if (nextScrollTop !== currentScrollTop) {
      layoutRef.current.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
    }
    setVersion((v) => v + 1);
  }, [children, scrollToBottom]);

  const scheduleSync = useCallback(() => {
    if (pendingSyncRef.current) {
      return;
    }
    pendingSyncRef.current = true;
    queueMicrotask(() => {
      pendingSyncRef.current = false;
      performSync();
    });
  }, [performSync]);

  const observerRef = useRef<ResizeObserver | null>(null);

  const setRef = useCallback(
    (node: DOMElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      (ref as React.MutableRefObject<DOMElement | null>).current = node;
      if (node) {
        observerRef.current = new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.target === node) {
              layoutRef.current.innerHeight = Math.round(
                entry.contentRect.height,
              );
            } else if (entry.target === contentRef.current) {
              layoutRef.current.scrollHeight = Math.round(
                entry.contentRect.height,
              );
            }
          }
          scheduleSync();
        });
        observerRef.current.observe(node);
        if (contentRef.current) {
          observerRef.current.observe(contentRef.current);
        }
      }
    },
    [scheduleSync],
  );

  const setContentRef = useCallback((node: DOMElement | null) => {
    (contentRef as React.MutableRefObject<DOMElement | null>).current = node;
    if (node && observerRef.current) {
      observerRef.current.observe(node);
    }
  }, []);

  useEffect(() => {
    layoutRef.current.scrollTop = scrollTop;
  }, [scrollTop]);

  // Sync if children count changed even if sizes didn't (e.g. scrollToBottom)
  useEffect(() => {
    scheduleSync();
  }, [children, scheduleSync]);

  const { getScrollTop, setPendingScrollTop } = useBatchedScroll(scrollTop);

  const scrollBy = useCallback(
    (delta: number) => {
      const { scrollHeight, innerHeight } = layoutRef.current;
      const current = getScrollTop();
      const next = Math.min(
        Math.max(0, current + delta),
        Math.max(0, scrollHeight - innerHeight),
      );
      setPendingScrollTop(next);
      setScrollTop(next);
    },
    [getScrollTop, setPendingScrollTop],
  );

  const { scrollbarColor, flashScrollbar, scrollByWithAnimation } =
    useAnimatedScrollbar(hasFocus, scrollBy);

  useKeypress(
    (key: Key) => {
      if (key.shift) {
        if (key.name === 'up') {
          scrollByWithAnimation(-1);
        }
        if (key.name === 'down') {
          scrollByWithAnimation(1);
        }
      }
    },
    { isActive: hasFocus },
  );

  const getScrollState = useCallback(
    () => ({
      scrollTop: getScrollTop(),
      scrollHeight: layoutRef.current.scrollHeight,
      innerHeight: layoutRef.current.innerHeight,
    }),
    [getScrollTop],
  );

  const hasFocusCallback = useCallback(() => hasFocus, [hasFocus]);

  const scrollableEntry = useMemo(
    () => ({
      ref: ref as React.RefObject<DOMElement>,
      getScrollState,
      scrollBy: scrollByWithAnimation,
      hasFocus: hasFocusCallback,
      flashScrollbar,
    }),
    [getScrollState, scrollByWithAnimation, hasFocusCallback, flashScrollbar],
  );

  useScrollable(scrollableEntry, hasFocus && ref.current !== null);

  return (
    <Box
      ref={setRef}
      maxHeight={maxHeight}
      width={width ?? maxWidth}
      height={height}
      flexDirection="column"
      overflowY="scroll"
      overflowX="hidden"
      scrollTop={scrollTop}
      flexGrow={flexGrow}
      scrollbarThumbColor={scrollbarColor}
    >
      {/*
        This inner box is necessary to prevent the parent from shrinking
        based on the children's content. It also adds a right padding to
        make room for the scrollbar.
      */}
      <Box
        ref={setContentRef}
        flexShrink={0}
        paddingRight={1}
        flexDirection="column"
      >
        {children}
      </Box>
    </Box>
  );
};
