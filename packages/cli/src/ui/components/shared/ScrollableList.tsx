/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, forwardRef, useImperativeHandle } from 'react';
import type React from 'react';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { VirtualizedList, type VirtualizedListRef } from './VirtualizedList.js';

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

  useImperativeHandle(ref, () => virtualizedListRef.current!, []);

  useKeypress(
    (key: Key) => {
      if (key.shift) {
        if (key.name === 'up') {
          virtualizedListRef.current?.scrollBy(-1);
        }
        if (key.name === 'down') {
          virtualizedListRef.current?.scrollBy(1);
        }
      }
    },
    { isActive: hasFocus },
  );

  return <VirtualizedList ref={virtualizedListRef} {...props} />;
}

const ScrollableListWithForwardRef = forwardRef(ScrollableList) as <T>(
  props: ScrollableListProps<T> & { ref?: React.Ref<ScrollableListRef<T>> },
) => React.ReactElement;

export { ScrollableListWithForwardRef as ScrollableList };
