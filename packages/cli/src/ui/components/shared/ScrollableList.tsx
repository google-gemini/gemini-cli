/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import type React from 'react';
import { VirtualizedList, type VirtualizedListRef } from './VirtualizedList.js';
import { useScrollable } from '../../contexts/ScrollProvider.js';
import { Box, type DOMElement } from 'ink';
import { useAnimatedScrollbar } from '../../hooks/useAnimatedScrollbar.js';

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

  useImperativeHandle(ref, () => virtualizedListRef.current!, []);

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

  useScrollable(
    {
      ref: containerRef as React.RefObject<DOMElement>,
      getScrollState,
      scrollBy: scrollByWithAnimation,
      hasFocus: () => hasFocus,
      flashScrollbar,
    },
    hasFocus && containerRef.current !== null,
  );

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
