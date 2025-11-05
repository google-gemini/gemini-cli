/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
  useMemo,
} from 'react';
import { Box, getInnerHeight, getScrollHeight, type DOMElement } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { useScrollable } from '../../contexts/ScrollProvider.js';
import { useAnimatedScrollbar } from '../../hooks/useAnimatedScrollbar.js';

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
  const ref = useRef<DOMElement>(null);
  const [size, setSize] = useState({
    innerHeight: 0,
    scrollHeight: 0,
  });
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  const childrenCountRef = useRef(0);

  // This effect needs to run on every render to correctly measure the container
  // and scroll to the bottom if new children are added. The if conditions
  // prevent infinite loops.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!ref.current) {
      return;
    }
    const innerHeight = Math.round(getInnerHeight(ref.current));
    const scrollHeight = Math.round(getScrollHeight(ref.current));

    const isAtBottom = scrollTop >= size.scrollHeight - size.innerHeight - 1;

    if (
      size.innerHeight !== innerHeight ||
      size.scrollHeight !== scrollHeight
    ) {
      setSize({ innerHeight, scrollHeight });
      if (isAtBottom) {
        setScrollTop(Math.max(0, scrollHeight - innerHeight));
      }
    }

    const childCountCurrent = React.Children.count(children);
    if (scrollToBottom && childrenCountRef.current !== childCountCurrent) {
      setScrollTop(Math.max(0, scrollHeight - innerHeight));
    }
    childrenCountRef.current = childCountCurrent;
  });

  const scrollBy = useCallback(
    (delta: number) => {
      const { scrollHeight, innerHeight } = sizeRef.current;
      setScrollTop((prev: number) =>
        Math.min(
          Math.max(0, prev + delta),
          Math.max(0, scrollHeight - innerHeight),
        ),
      );
    },
    [sizeRef],
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
      scrollTop,
      scrollHeight: size.scrollHeight,
      innerHeight: size.innerHeight,
    }),
    [scrollTop, size.scrollHeight, size.innerHeight],
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
      ref={ref}
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
      <Box flexShrink={0} paddingRight={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
};
