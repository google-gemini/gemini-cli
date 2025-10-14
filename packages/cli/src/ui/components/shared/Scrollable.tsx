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
} from 'react';
import { Box, getInnerHeight, getScrollHeight, type DOMElement } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { theme } from '../../semantic-colors.js';
import { useScrollable } from '../../contexts/ScrollProvider.js';

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
  useLayoutEffect(() => {
    if (!ref.current) {
      return;
    }
    const innerHeight = getInnerHeight(ref.current);
    const scrollHeight = getScrollHeight(ref.current);

    if (
      size.innerHeight !== innerHeight ||
      size.scrollHeight !== scrollHeight
    ) {
      setSize({ innerHeight, scrollHeight });
    }

    const childCountCurrent = React.Children.count(children);
    if (scrollToBottom && childrenCountRef.current !== childCountCurrent) {
      console.log('Scrolling to bottom');
      setScrollTop(Math.max(0, scrollHeight - innerHeight));
    }
    childrenCountRef.current = childCountCurrent;
  }, [size.innerHeight, size.scrollHeight, children, scrollToBottom]);

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

  useKeypress(
    (key: Key) => {
      if (key.shift) {
        if (key.name === 'up') {
          scrollBy(-1);
        }
        if (key.name === 'down') {
          scrollBy(1);
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

  useScrollable(
    {
      ref: ref as React.RefObject<DOMElement>,
      getScrollState,
      scrollBy,
      hasFocus: () => hasFocus,
    },
    hasFocus && ref.current !== null,
  );

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
      scrollbarThumbColor={theme.text.secondary}
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
