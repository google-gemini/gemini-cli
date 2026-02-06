/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useCallback,
} from 'react';
import type React from 'react';
import { theme } from '../../semantic-colors.js';
import { useBatchedScroll } from '../../hooks/useBatchedScroll.js';

import { type DOMElement, measureElement, Box, ResizeObserver } from 'ink';

export const SCROLL_TO_ITEM_END = Number.MAX_SAFE_INTEGER;

type VirtualizedListProps<T> = {
  data: T[];
  renderItem: (info: { item: T; index: number }) => React.ReactElement;
  estimatedItemHeight: (index: number) => number;
  keyExtractor: (item: T, index: number) => string;
  initialScrollIndex?: number;
  initialScrollOffsetInIndex?: number;
  scrollbarThumbColor?: string;
};

export type VirtualizedListRef<T> = {
  scrollBy: (delta: number) => void;
  scrollTo: (offset: number) => void;
  scrollToEnd: () => void;
  scrollToIndex: (params: {
    index: number;
    viewOffset?: number;
    viewPosition?: number;
  }) => void;
  scrollToItem: (params: {
    item: T;
    viewOffset?: number;
    viewPosition?: number;
  }) => void;
  getScrollIndex: () => number;
  getScrollState: () => {
    scrollTop: number;
    scrollHeight: number;
    innerHeight: number;
  };
};

function findLastIndex<T>(
  array: T[],
  predicate: (value: T, index: number, obj: T[]) => unknown,
): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i], i, array)) {
      return i;
    }
  }
  return -1;
}

function VirtualizedList<T>(
  props: VirtualizedListProps<T>,
  ref: React.Ref<VirtualizedListRef<T>>,
) {
  const {
    data,
    renderItem,
    estimatedItemHeight,
    keyExtractor,
    initialScrollIndex,
    initialScrollOffsetInIndex,
  } = props;

  const [, setVersion] = useState(0);

  const layoutRef = useRef({
    scrollAnchor: { index: 0, offset: 0 },
    isStickingToBottom: false,
    containerHeight: 0,
    heights: [] as number[],
    offsets: [0] as number[],
    totalHeight: 0,
    isInitialScrollSet: false,
    prevDataLength: data.length,
    prevTotalHeight: 0,
    prevScrollTop: 0,
    prevContainerHeight: 0,
    scrollTop: 0,
  });

  if (layoutRef.current.heights.length === 0 && data.length > 0) {
    layoutRef.current.heights = data.map((_, i) => estimatedItemHeight(i));
    let totalHeight = 0;
    const offsets = [0];
    for (let i = 0; i < data.length; i++) {
      totalHeight += layoutRef.current.heights[i] ?? 0;
      offsets.push(totalHeight);
    }
    layoutRef.current.totalHeight = totalHeight;
    layoutRef.current.offsets = offsets;

    const scrollToEnd =
      initialScrollIndex === SCROLL_TO_ITEM_END ||
      (typeof initialScrollIndex === 'number' &&
        initialScrollIndex >= data.length - 1 &&
        initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);

    if (scrollToEnd) {
      layoutRef.current.scrollAnchor = {
        index: data.length > 0 ? data.length - 1 : 0,
        offset: SCROLL_TO_ITEM_END,
      };
      layoutRef.current.isStickingToBottom = true;
    } else if (typeof initialScrollIndex === 'number') {
      layoutRef.current.scrollAnchor = {
        index: Math.max(0, Math.min(data.length - 1, initialScrollIndex)),
        offset: initialScrollOffsetInIndex ?? 0,
      };
    }
  }

  const pendingSyncRef = useRef(false);

  const performSync = useCallback(() => {
    const layout = layoutRef.current;
    const { heights, containerHeight } = layout;

    // 1. Recalculate offsets if data length or heights changed
    if (heights.length !== data.length) {
      if (data.length < heights.length) {
        heights.length = data.length;
      } else {
        for (let i = heights.length; i < data.length; i++) {
          heights[i] = estimatedItemHeight(i);
        }
      }
    }

    const offsets = [0];
    let totalHeight = 0;
    for (let i = 0; i < data.length; i++) {
      totalHeight += heights[i] ?? 0;
      offsets.push(totalHeight);
    }
    layout.offsets = offsets;
    layout.totalHeight = totalHeight;

    // 2. Determine sticking and scrolling logic
    const wasAtBottom =
      layout.prevContainerHeight > 0 &&
      (layout.prevTotalHeight <= layout.prevContainerHeight ||
        layout.prevScrollTop >=
          layout.prevTotalHeight - layout.prevContainerHeight - 1);

    const listGrew = data.length > layout.prevDataLength;
    const containerChanged =
      layout.prevContainerHeight > 0 &&
      layout.prevContainerHeight !== containerHeight;

    if (
      (listGrew && (layout.isStickingToBottom || wasAtBottom)) ||
      (layout.isStickingToBottom && containerChanged)
    ) {
      layout.scrollAnchor = {
        index: data.length > 0 ? data.length - 1 : 0,
        offset: SCROLL_TO_ITEM_END,
      };
      layout.isStickingToBottom = true;
    } else if (
      (layout.scrollAnchor.index >= data.length ||
        layout.scrollTop > totalHeight - containerHeight) &&
      data.length > 0
    ) {
      const newScrollTop = Math.max(0, totalHeight - containerHeight);
      const index = findLastIndex(offsets, (offset) => offset <= newScrollTop);
      layout.scrollAnchor = {
        index: Math.max(0, index),
        offset: newScrollTop - (offsets[index] ?? 0),
      };
    } else if (data.length === 0) {
      layout.scrollAnchor = { index: 0, offset: 0 };
    }

    // 3. Initial scroll positioning (one-time)
    if (
      !layout.isInitialScrollSet &&
      offsets.length > 1 &&
      totalHeight > 0 &&
      containerHeight > 0
    ) {
      if (typeof initialScrollIndex === 'number') {
        const scrollToEnd =
          initialScrollIndex === SCROLL_TO_ITEM_END ||
          (initialScrollIndex >= data.length - 1 &&
            initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);

        if (scrollToEnd) {
          layout.scrollAnchor = {
            index: data.length - 1,
            offset: SCROLL_TO_ITEM_END,
          };
          layout.isStickingToBottom = true;
        } else {
          const index = Math.max(
            0,
            Math.min(data.length - 1, initialScrollIndex),
          );
          const offset = initialScrollOffsetInIndex ?? 0;
          const newScrollTop = (offsets[index] ?? 0) + offset;
          const clampedScrollTop = Math.max(
            0,
            Math.min(totalHeight - containerHeight, newScrollTop),
          );
          const foundIndex = findLastIndex(
            offsets,
            (off) => off <= clampedScrollTop,
          );
          layout.scrollAnchor = {
            index: Math.max(0, foundIndex),
            offset: clampedScrollTop - (offsets[foundIndex] ?? 0),
          };
        }
      }
      layout.isInitialScrollSet = true;
    }

    // 4. Calculate final scrollTop for render
    const anchor = layout.scrollAnchor;
    const offset = offsets[anchor.index];
    let finalScrollTop = 0;
    if (typeof offset === 'number') {
      if (anchor.offset === SCROLL_TO_ITEM_END) {
        const itemHeight = heights[anchor.index] ?? 0;
        finalScrollTop = offset + itemHeight - containerHeight;
      } else {
        finalScrollTop = offset + anchor.offset;
      }
    }
    layout.scrollTop = Math.max(0, finalScrollTop);

    // After updating scrollTop, check if we should be sticking
    const isNowAtBottom =
      containerHeight > 0 &&
      layout.scrollTop >= totalHeight - containerHeight - 1;
    if (isNowAtBottom) {
      layout.isStickingToBottom = true;
    }

    // Update prev values for next sync
    layout.prevDataLength = data.length;
    layout.prevTotalHeight = totalHeight;
    layout.prevScrollTop = layout.scrollTop;
    layout.prevContainerHeight = containerHeight;

    setVersion((v) => v + 1);
  }, [
    data,
    estimatedItemHeight,
    initialScrollIndex,
    initialScrollOffsetInIndex,
  ]);

  const scheduleSync = useCallback(() => {
    if (pendingSyncRef.current) return;
    pendingSyncRef.current = true;
    queueMicrotask(() => {
      pendingSyncRef.current = false;
      performSync();
    });
  }, [performSync]);

  const containerRef = useRef<DOMElement>(null);
  const containerObserverRef = useRef<ResizeObserver | null>(null);
  const setContainerRef = useCallback(
    (node: DOMElement | null) => {
      if (containerObserverRef.current) {
        containerObserverRef.current.disconnect();
        containerObserverRef.current = null;
      }
      (containerRef as React.MutableRefObject<DOMElement | null>).current =
        node;
      if (node) {
        layoutRef.current.containerHeight = Math.round(
          measureElement(node).height,
        );
        containerObserverRef.current = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            layoutRef.current.containerHeight = Math.round(
              entry.contentRect.height,
            );
            scheduleSync();
          }
        });
        containerObserverRef.current.observe(node);
        scheduleSync();
      }
    },
    [scheduleSync],
  );

  const itemsObserverRef = useRef<ResizeObserver | null>(null);
  const elementToIndexRef = useRef(new Map<DOMElement, number>());
  const itemRefs = useRef<Array<DOMElement | null>>([]);

  const setItemRef = useCallback(
    (el: DOMElement | null, index: number) => {
      const prevEl = itemRefs.current[index];
      if (prevEl === el) return;

      if (prevEl && itemsObserverRef.current) {
        itemsObserverRef.current.unobserve(prevEl);
        elementToIndexRef.current.delete(prevEl);
      }

      itemRefs.current[index] = el;

      if (el) {
        elementToIndexRef.current.set(el, index);
        const height = Math.round(measureElement(el).height);
        if (layoutRef.current.heights[index] !== height) {
          layoutRef.current.heights[index] = height;
          scheduleSync();
        }

        if (!itemsObserverRef.current) {
          itemsObserverRef.current = new ResizeObserver((entries) => {
            let changed = false;
            for (const entry of entries) {
              const idx = elementToIndexRef.current.get(entry.target);
              if (idx !== undefined) {
                const h = Math.round(entry.contentRect.height);
                if (layoutRef.current.heights[idx] !== h) {
                  layoutRef.current.heights[idx] = h;
                  changed = true;
                }
              }
            }
            if (changed) scheduleSync();
          });
        }
        itemsObserverRef.current.observe(el);
      }
    },
    [scheduleSync],
  );

  const itemRefCallbacks = useRef<Map<number, (el: DOMElement | null) => void>>(
    new Map(),
  );
  const getItemRef = useCallback(
    (index: number) => {
      let cb = itemRefCallbacks.current.get(index);
      if (!cb) {
        cb = (el: DOMElement | null) => setItemRef(el, index);
        itemRefCallbacks.current.set(index, cb);
      }
      return cb;
    },
    [setItemRef],
  );

  useEffect(() => {
    scheduleSync();
  }, [data, scheduleSync]);

  useEffect(() => () => itemsObserverRef.current?.disconnect(), []);

  const { offsets, scrollTop, totalHeight, containerHeight } =
    layoutRef.current;

  const startIndex = Math.max(
    0,
    findLastIndex(offsets, (offset) => offset <= scrollTop) - 1,
  );
  const endIndexOffset = offsets.findIndex(
    (offset) => offset > scrollTop + containerHeight,
  );
  const endIndex =
    endIndexOffset === -1
      ? data.length - 1
      : Math.min(data.length - 1, endIndexOffset);

  const topSpacerHeight = offsets[startIndex] ?? 0;
  const bottomSpacerHeight =
    totalHeight - (offsets[endIndex + 1] ?? totalHeight);

  const renderedItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const item = data[i];
    if (item) {
      renderedItems.push(
        <Box key={keyExtractor(item, i)} width="100%" ref={getItemRef(i)}>
          {renderItem({ item, index: i })}
        </Box>,
      );
    }
  }

  const { getScrollTop, setPendingScrollTop } = useBatchedScroll(scrollTop);

  const getAnchorForScrollTop = useCallback(
    (top: number, offs: number[]): { index: number; offset: number } => {
      const index = findLastIndex(offs, (off) => off <= top);
      if (index === -1) {
        return { index: 0, offset: 0 };
      }

      return { index, offset: top - (offs[index] ?? 0) };
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollBy: (delta: number) => {
        if (delta < 0) {
          layoutRef.current.isStickingToBottom = false;
        }
        const currentScrollTop = getScrollTop();
        const newScrollTop = Math.max(
          0,
          Math.min(totalHeight - containerHeight, currentScrollTop + delta),
        );
        setPendingScrollTop(newScrollTop);
        layoutRef.current.scrollAnchor = getAnchorForScrollTop(
          newScrollTop,
          offsets,
        );
        scheduleSync();
      },
      scrollTo: (offset: number) => {
        layoutRef.current.isStickingToBottom = false;
        const newScrollTop = Math.max(
          0,
          Math.min(totalHeight - containerHeight, offset),
        );
        setPendingScrollTop(newScrollTop);
        layoutRef.current.scrollAnchor = getAnchorForScrollTop(
          newScrollTop,
          offsets,
        );
        scheduleSync();
      },
      scrollToEnd: () => {
        layoutRef.current.isStickingToBottom = true;
        if (data.length > 0) {
          layoutRef.current.scrollAnchor = {
            index: data.length - 1,
            offset: SCROLL_TO_ITEM_END,
          };
          scheduleSync();
        }
      },
      scrollToIndex: ({
        index,
        viewOffset = 0,
        viewPosition = 0,
      }: {
        index: number;
        viewOffset?: number;
        viewPosition?: number;
      }) => {
        layoutRef.current.isStickingToBottom = false;
        const offset = offsets[index];
        if (offset !== undefined) {
          const newScrollTop = Math.max(
            0,
            Math.min(
              totalHeight - containerHeight,
              offset - viewPosition * containerHeight + viewOffset,
            ),
          );
          setPendingScrollTop(newScrollTop);
          layoutRef.current.scrollAnchor = getAnchorForScrollTop(
            newScrollTop,
            offsets,
          );
          scheduleSync();
        }
      },
      scrollToItem: ({
        item,
        viewOffset = 0,
        viewPosition = 0,
      }: {
        item: T;
        viewOffset?: number;
        viewPosition?: number;
      }) => {
        layoutRef.current.isStickingToBottom = false;
        const index = data.indexOf(item);
        if (index !== -1) {
          const offset = offsets[index];
          if (offset !== undefined) {
            const newScrollTop = Math.max(
              0,
              Math.min(
                totalHeight - containerHeight,
                offset - viewPosition * containerHeight + viewOffset,
              ),
            );
            setPendingScrollTop(newScrollTop);
            layoutRef.current.scrollAnchor = getAnchorForScrollTop(
              newScrollTop,
              offsets,
            );
            scheduleSync();
          }
        }
      },
      getScrollIndex: () => layoutRef.current.scrollAnchor.index,
      getScrollState: () => ({
        scrollTop: getScrollTop(),
        scrollHeight: totalHeight,
        innerHeight: containerHeight,
      }),
    }),
    [
      offsets,
      totalHeight,
      getAnchorForScrollTop,
      data,
      getScrollTop,
      setPendingScrollTop,
      containerHeight,
      scheduleSync,
    ],
  );

  return (
    <Box
      ref={setContainerRef}
      overflowY="scroll"
      overflowX="hidden"
      scrollTop={scrollTop}
      scrollbarThumbColor={props.scrollbarThumbColor ?? theme.text.secondary}
      width="100%"
      height="100%"
      flexDirection="column"
      paddingRight={1}
    >
      <Box flexShrink={0} width="100%" flexDirection="column">
        <Box height={topSpacerHeight} flexShrink={0} />
        {renderedItems}
        <Box height={bottomSpacerHeight} flexShrink={0} />
      </Box>
    </Box>
  );
}

const VirtualizedListWithForwardRef = forwardRef(VirtualizedList) as <T>(
  props: VirtualizedListProps<T> & { ref?: React.Ref<VirtualizedListRef<T>> },
) => React.ReactElement;

export { VirtualizedListWithForwardRef as VirtualizedList };

VirtualizedList.displayName = 'VirtualizedList';
