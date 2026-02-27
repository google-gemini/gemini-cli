/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useState,
  useRef,
  useLayoutEffect,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useCallback,
} from 'react';
import type React from 'react';
import { theme } from '../../semantic-colors.js';
import { useBatchedScroll } from '../../hooks/useBatchedScroll.js';
import { useUIState } from '../../contexts/UIStateContext.js';

import { type DOMElement, Box, ResizeObserver } from 'ink';

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
  const { copyModeEnabled } = useUIState();
  const dataRef = useRef(data);
  useLayoutEffect(() => {
    dataRef.current = data;
  }, [data]);

  const [scrollAnchor, setScrollAnchor] = useState(() => {
    const scrollToEnd =
      initialScrollIndex === SCROLL_TO_ITEM_END ||
      (typeof initialScrollIndex === 'number' &&
        initialScrollIndex >= data.length - 1 &&
        initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);

    if (scrollToEnd) {
      return {
        index: data.length > 0 ? data.length - 1 : 0,
        offset: SCROLL_TO_ITEM_END,
      };
    }

    if (typeof initialScrollIndex === 'number') {
      return {
        index: Math.max(0, Math.min(data.length - 1, initialScrollIndex)),
        offset: initialScrollOffsetInIndex ?? 0,
      };
    }

    return { index: 0, offset: 0 };
  });

  const [isStickingToBottom, setIsStickingToBottom] = useState(() => {
    const scrollToEnd =
      initialScrollIndex === SCROLL_TO_ITEM_END ||
      (typeof initialScrollIndex === 'number' &&
        initialScrollIndex >= data.length - 1 &&
        initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);
    return scrollToEnd;
  });

  const containerRef = useRef<DOMElement | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const itemRefs = useRef<Array<DOMElement | null>>([]);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const isInitialScrollSet = useRef(false);

  const containerObserverRef = useRef<ResizeObserver | null>(null);
  const nodeToKeyRef = useRef(new WeakMap<DOMElement, string>());

  const containerRefCallback = useCallback((node: DOMElement | null) => {
    containerObserverRef.current?.disconnect();
    containerRef.current = node;
    if (node) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          setContainerHeight(Math.round(entry.contentRect.height));
        }
      });
      observer.observe(node);
      containerObserverRef.current = observer;
    }
  }, []);

  const itemsObserver = useMemo(
    () =>
      new ResizeObserver((entries) => {
        setHeights((prev) => {
          let next: Record<string, number> | null = null;
          for (const entry of entries) {
            const key = nodeToKeyRef.current.get(entry.target);
            if (key !== undefined) {
              const height = Math.round(entry.contentRect.height);
              if (prev[key] !== height) {
                if (!next) {
                  next = { ...prev };
                }
                next[key] = height;
              }
            }
          }
          return next ?? prev;
        });
      }),
    [],
  );

  useLayoutEffect(
    () => () => {
      containerObserverRef.current?.disconnect();
      itemsObserver.disconnect();
    },
    [itemsObserver],
  );

  const { totalHeight, offsets } = useMemo(() => {
    const offsets: number[] = [0];
    let totalHeight = 0;
    for (let i = 0; i < data.length; i++) {
      const key = keyExtractor(data[i], i);
      const height = heights[key] ?? estimatedItemHeight(i);
      totalHeight += height;
      offsets.push(totalHeight);
    }
    return { totalHeight, offsets };
  }, [heights, data, estimatedItemHeight, keyExtractor]);

  const scrollableContainerHeight = containerHeight;

  const getAnchorForScrollTop = useCallback(
    (
      scrollTop: number,
      offsets: number[],
    ): { index: number; offset: number } => {
      const index = findLastIndex(offsets, (offset) => offset <= scrollTop);
      if (index === -1) {
        return { index: 0, offset: 0 };
      }

      return { index, offset: scrollTop - offsets[index] };
    },
    [],
  );

  const actualScrollTop = useMemo(() => {
    const offset = offsets[scrollAnchor.index];
    if (typeof offset !== 'number') {
      return 0;
    }

    if (scrollAnchor.offset === SCROLL_TO_ITEM_END) {
      const item = data[scrollAnchor.index];
      const key = item ? keyExtractor(item, scrollAnchor.index) : '';
      const itemHeight = heights[key] ?? 0;
      return offset + itemHeight - scrollableContainerHeight;
    }

    return offset + scrollAnchor.offset;
  }, [
    scrollAnchor,
    offsets,
    heights,
    scrollableContainerHeight,
    data,
    keyExtractor,
  ]);

  const scrollTop = isStickingToBottom
    ? Number.MAX_SAFE_INTEGER
    : actualScrollTop;

  const prevDataLength = useRef(data.length);
  const prevTotalHeight = useRef(totalHeight);
  const prevScrollTop = useRef(actualScrollTop);
  const prevContainerHeight = useRef(scrollableContainerHeight);

  useLayoutEffect(() => {
    const contentPreviouslyFit =
      prevTotalHeight.current <= prevContainerHeight.current;
    const wasScrolledToBottomPixels =
      prevScrollTop.current >=
      prevTotalHeight.current - prevContainerHeight.current - 1;
    const wasAtBottom = contentPreviouslyFit || wasScrolledToBottomPixels;

    if (wasAtBottom && actualScrollTop >= prevScrollTop.current) {
      setIsStickingToBottom(true);
    }

    const listGrew = data.length > prevDataLength.current;
    const containerChanged =
      prevContainerHeight.current !== scrollableContainerHeight;

    if (
      (listGrew && (isStickingToBottom || wasAtBottom)) ||
      (isStickingToBottom && containerChanged)
    ) {
      setScrollAnchor({
        index: data.length > 0 ? data.length - 1 : 0,
        offset: SCROLL_TO_ITEM_END,
      });
      if (!isStickingToBottom) {
        setIsStickingToBottom(true);
      }
    } else if (
      (scrollAnchor.index >= data.length ||
        actualScrollTop > totalHeight - scrollableContainerHeight) &&
      data.length > 0
    ) {
      const newScrollTop = Math.max(0, totalHeight - scrollableContainerHeight);
      setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
    } else if (data.length === 0) {
      setScrollAnchor({ index: 0, offset: 0 });
    }

    prevDataLength.current = data.length;
    prevTotalHeight.current = totalHeight;
    prevScrollTop.current = actualScrollTop;
    prevContainerHeight.current = scrollableContainerHeight;
  }, [
    data.length,
    totalHeight,
    actualScrollTop,
    scrollableContainerHeight,
    scrollAnchor.index,
    getAnchorForScrollTop,
    offsets,
    isStickingToBottom,
  ]);

  useLayoutEffect(() => {
    if (
      isInitialScrollSet.current ||
      offsets.length <= 1 ||
      totalHeight <= 0 ||
      containerHeight <= 0
    ) {
      return;
    }

    if (typeof initialScrollIndex === 'number') {
      const scrollToEnd =
        initialScrollIndex === SCROLL_TO_ITEM_END ||
        (initialScrollIndex >= data.length - 1 &&
          initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);

      if (scrollToEnd) {
        setScrollAnchor({
          index: data.length - 1,
          offset: SCROLL_TO_ITEM_END,
        });
        setIsStickingToBottom(true);
        isInitialScrollSet.current = true;
        return;
      }

      const index = Math.max(0, Math.min(data.length - 1, initialScrollIndex));
      const offset = initialScrollOffsetInIndex ?? 0;
      const newScrollTop = (offsets[index] ?? 0) + offset;

      const clampedScrollTop = Math.max(
        0,
        Math.min(totalHeight - scrollableContainerHeight, newScrollTop),
      );

      setScrollAnchor(getAnchorForScrollTop(clampedScrollTop, offsets));
      isInitialScrollSet.current = true;
    }
  }, [
    initialScrollIndex,
    initialScrollOffsetInIndex,
    offsets,
    totalHeight,
    containerHeight,
    getAnchorForScrollTop,
    data.length,
    heights,
    scrollableContainerHeight,
  ]);

  const startIndex = Math.max(
    0,
    findLastIndex(offsets, (offset) => offset <= actualScrollTop) - 1,
  );
  const endIndexOffset = offsets.findIndex(
    (offset) => offset > actualScrollTop + scrollableContainerHeight,
  );
  const endIndex =
    endIndexOffset === -1
      ? data.length - 1
      : Math.min(data.length - 1, endIndexOffset);

  const topSpacerHeight = offsets[startIndex] ?? 0;
  const bottomSpacerHeight =
    totalHeight - (offsets[endIndex + 1] ?? totalHeight);

  // Maintain a stable set of observed nodes using useLayoutEffect
  const observedNodes = useRef<Set<DOMElement>>(new Set());
  useLayoutEffect(() => {
    const currentNodes = new Set<DOMElement>();
    for (let i = startIndex; i <= endIndex; i++) {
      const node = itemRefs.current[i];
      const item = data[i];
      if (node && item) {
        currentNodes.add(node);
        const key = keyExtractor(item, i);
        // Always update the key mapping because React can reuse nodes at different indices/keys
        nodeToKeyRef.current.set(node, key);
        if (!observedNodes.current.has(node)) {
          itemsObserver.observe(node);
        }
      }
    }
    for (const node of observedNodes.current) {
      if (!currentNodes.has(node)) {
        itemsObserver.unobserve(node);
        nodeToKeyRef.current.delete(node);
      }
    }
    observedNodes.current = currentNodes;
  });

  const renderedItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const item = data[i];
    if (item) {
      renderedItems.push(
        <Box
          key={keyExtractor(item, i)}
          width="100%"
          flexDirection="column"
          flexShrink={0}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
        >
          {renderItem({ item, index: i })}
        </Box>,
      );
    }
  }

  const { getScrollTop, setPendingScrollTop } = useBatchedScroll(scrollTop);

  useImperativeHandle(
    ref,
    () => ({
      scrollBy: (delta: number) => {
        if (delta < 0) {
          setIsStickingToBottom(false);
        }
        const currentScrollTop = getScrollTop();
        const maxScroll = Math.max(0, totalHeight - scrollableContainerHeight);
        const actualCurrent = Math.min(currentScrollTop, maxScroll);
        let newScrollTop = Math.max(0, actualCurrent + delta);
        if (newScrollTop >= maxScroll) {
          setIsStickingToBottom(true);
          newScrollTop = Number.MAX_SAFE_INTEGER;
        }
        setPendingScrollTop(newScrollTop);
        setScrollAnchor(
          getAnchorForScrollTop(Math.min(newScrollTop, maxScroll), offsets),
        );
      },
      scrollTo: (offset: number) => {
        const maxScroll = Math.max(0, totalHeight - scrollableContainerHeight);
        if (offset >= maxScroll || offset === SCROLL_TO_ITEM_END) {
          setIsStickingToBottom(true);
          setPendingScrollTop(Number.MAX_SAFE_INTEGER);
          if (data.length > 0) {
            setScrollAnchor({
              index: data.length - 1,
              offset: SCROLL_TO_ITEM_END,
            });
          }
        } else {
          setIsStickingToBottom(false);
          const newScrollTop = Math.max(0, offset);
          setPendingScrollTop(newScrollTop);
          setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
        }
      },
      scrollToEnd: () => {
        setIsStickingToBottom(true);
        setPendingScrollTop(Number.MAX_SAFE_INTEGER);
        if (data.length > 0) {
          setScrollAnchor({
            index: data.length - 1,
            offset: SCROLL_TO_ITEM_END,
          });
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
        setIsStickingToBottom(false);
        const offset = offsets[index];
        if (offset !== undefined) {
          const maxScroll = Math.max(
            0,
            totalHeight - scrollableContainerHeight,
          );
          const newScrollTop = Math.max(
            0,
            Math.min(
              maxScroll,
              offset - viewPosition * scrollableContainerHeight + viewOffset,
            ),
          );
          setPendingScrollTop(newScrollTop);
          setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
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
        setIsStickingToBottom(false);
        const index = data.indexOf(item);
        if (index !== -1) {
          const offset = offsets[index];
          if (offset !== undefined) {
            const maxScroll = Math.max(
              0,
              totalHeight - scrollableContainerHeight,
            );
            const newScrollTop = Math.max(
              0,
              Math.min(
                maxScroll,
                offset - viewPosition * scrollableContainerHeight + viewOffset,
              ),
            );
            setPendingScrollTop(newScrollTop);
            setScrollAnchor(getAnchorForScrollTop(newScrollTop, offsets));
          }
        }
      },
      getScrollIndex: () => scrollAnchor.index,
      getScrollState: () => {
        const maxScroll = Math.max(0, totalHeight - containerHeight);
        return {
          scrollTop: Math.min(getScrollTop(), maxScroll),
          scrollHeight: totalHeight,
          innerHeight: containerHeight,
        };
      },
    }),
    [
      offsets,
      scrollAnchor,
      totalHeight,
      getAnchorForScrollTop,
      data,
      scrollableContainerHeight,
      getScrollTop,
      setPendingScrollTop,
      containerHeight,
    ],
  );

  return (
    <Box
      ref={containerRefCallback}
      overflowY={copyModeEnabled ? 'hidden' : 'scroll'}
      overflowX="hidden"
      scrollTop={copyModeEnabled ? 0 : scrollTop}
      scrollbarThumbColor={props.scrollbarThumbColor ?? theme.text.secondary}
      width="100%"
      height="100%"
      flexDirection="column"
      paddingRight={copyModeEnabled ? 0 : 1}
    >
      <Box
        flexShrink={0}
        width="100%"
        flexDirection="column"
        marginTop={copyModeEnabled ? -actualScrollTop : 0}
      >
        <Box height={topSpacerHeight} flexShrink={0} />
        {renderedItems}
        <Box height={bottomSpacerHeight} flexShrink={0} />
      </Box>
    </Box>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const VirtualizedListWithForwardRef = forwardRef(VirtualizedList) as <T>(
  props: VirtualizedListProps<T> & { ref?: React.Ref<VirtualizedListRef<T>> },
) => React.ReactElement;

export { VirtualizedListWithForwardRef as VirtualizedList };

VirtualizedList.displayName = 'VirtualizedList';
