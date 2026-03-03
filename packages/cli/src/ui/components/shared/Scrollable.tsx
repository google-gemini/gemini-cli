/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { Box, ResizeObserver, type DOMElement } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { useScrollable } from '../../contexts/ScrollProvider.js';
import { useAnimatedScrollbar } from '../../hooks/useAnimatedScrollbar.js';
import { useBatchedScroll } from '../../hooks/useBatchedScroll.js';
import { keyMatchers, Command } from '../../keyMatchers.js';

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
  const viewportRef = useRef<DOMElement | null>(null);
  const contentRef = useRef<DOMElement | null>(null);
  const [size, setSize] = useState({
    innerHeight: typeof height === 'number' ? height : 0,
    scrollHeight: 0,
  });
  const sizeRef = useRef(size);
  const scrollTopRef = useRef(scrollTop);

  useLayoutEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useLayoutEffect(() => {
    scrollTopRef.current = scrollTop;
  }, [scrollTop]);

  const viewportObserverRef = useRef<ResizeObserver | null>(null);
  const contentObserverRef = useRef<ResizeObserver | null>(null);

  const viewportRefCallback = useCallback((node: DOMElement | null) => {
    viewportObserverRef.current?.disconnect();
    viewportRef.current = node;

    if (node) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const innerHeight = Math.round(entry.contentRect.height);
          setSize((prev) => {
            const scrollHeight = prev.scrollHeight;
            const isAtBottom =
              scrollHeight > prev.innerHeight &&
              scrollTopRef.current >= scrollHeight - prev.innerHeight - 1;

            if (isAtBottom) {
              setScrollTop(Number.MAX_SAFE_INTEGER);
            }
            return { ...prev, innerHeight };
          });
        }
      });
      observer.observe(node);
      viewportObserverRef.current = observer;
    }
  }, []);

  const contentRefCallback = useCallback(
    (node: DOMElement | null) => {
      contentObserverRef.current?.disconnect();
      contentRef.current = node;

      if (node) {
        const observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            const scrollHeight = Math.round(entry.contentRect.height);
            setSize((prev) => {
              const innerHeight = prev.innerHeight;
              const isAtBottom =
                prev.scrollHeight > innerHeight &&
                scrollTopRef.current >= prev.scrollHeight - innerHeight - 1;

              if (
                isAtBottom ||
                (scrollToBottom && scrollHeight > prev.scrollHeight)
              ) {
                setScrollTop(Number.MAX_SAFE_INTEGER);
              }
              return { ...prev, scrollHeight };
            });
          }
        });
        observer.observe(node);
        contentObserverRef.current = observer;
      }
    },
    [scrollToBottom],
  );

  const { getScrollTop, setPendingScrollTop } = useBatchedScroll(scrollTop);

  const scrollBy = useCallback(
    (delta: number) => {
      const { scrollHeight, innerHeight } = sizeRef.current;
      const maxScroll = Math.max(0, scrollHeight - innerHeight);
      const current = Math.min(getScrollTop(), maxScroll);
      let next = Math.max(0, current + delta);
      if (next >= maxScroll) {
        next = Number.MAX_SAFE_INTEGER;
      }
      setPendingScrollTop(next);
      setScrollTop(next);
    },
    [getScrollTop, setPendingScrollTop],
  );

  const { scrollbarColor, flashScrollbar, scrollByWithAnimation } =
    useAnimatedScrollbar(hasFocus, scrollBy);

  useKeypress(
    (key: Key) => {
      const { scrollHeight, innerHeight } = sizeRef.current;
      const scrollTop = getScrollTop();
      const maxScroll = Math.max(0, scrollHeight - innerHeight);
      const actualScrollTop = Math.min(scrollTop, maxScroll);

      // Only capture scroll-up events if there's room;
      // otherwise allow events to bubble.
      if (actualScrollTop > 0) {
        if (keyMatchers[Command.PAGE_UP](key)) {
          scrollByWithAnimation(-innerHeight);
          return true;
        }
        if (keyMatchers[Command.SCROLL_UP](key)) {
          scrollByWithAnimation(-1);
          return true;
        }
      }

      // Only capture scroll-down events if there's room;
      // otherwise allow events to bubble.
      if (actualScrollTop < maxScroll) {
        if (keyMatchers[Command.PAGE_DOWN](key)) {
          scrollByWithAnimation(innerHeight);
          return true;
        }
        if (keyMatchers[Command.SCROLL_DOWN](key)) {
          scrollByWithAnimation(1);
          return true;
        }
      }

      // bubble keypress
      return false;
    },
    { isActive: hasFocus },
  );

  const getScrollState = useCallback(() => {
    const maxScroll = Math.max(0, size.scrollHeight - size.innerHeight);
    return {
      scrollTop: Math.min(getScrollTop(), maxScroll),
      scrollHeight: size.scrollHeight,
      innerHeight: size.innerHeight,
    };
  }, [getScrollTop, size.scrollHeight, size.innerHeight]);

  const hasFocusCallback = useCallback(() => hasFocus, [hasFocus]);

  const scrollableEntry = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      ref: viewportRef as React.RefObject<DOMElement>,
      getScrollState,
      scrollBy: scrollByWithAnimation,
      hasFocus: hasFocusCallback,
      flashScrollbar,
    }),
    [getScrollState, scrollByWithAnimation, hasFocusCallback, flashScrollbar],
  );

  useScrollable(scrollableEntry, true);

  return (
    <Box
      ref={viewportRefCallback}
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
        ref={contentRefCallback}
        flexShrink={0}
        paddingRight={1}
        flexDirection="column"
      >
        {children}
      </Box>
    </Box>
  );
};
