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
  memo,
} from 'react';
import type React from 'react';
import { theme } from '../../semantic-colors.js';
import { useBatchedScroll } from '../../hooks/useBatchedScroll.js';

import { type DOMElement, Box, ResizeObserver, StaticRender } from 'ink';

export const SCROLL_TO_ITEM_END = Number.MAX_SAFE_INTEGER;

export type VirtualizedListProps<T> = {
  data: T[];
  renderItem: (info: { item: T; index: number }) => React.ReactElement;
  estimatedItemHeight: (index: number) => number;
  keyExtractor: (item: T, index: number) => string;
  initialScrollIndex?: number;
  initialScrollOffsetInIndex?: number;
  targetScrollIndex?: number;
  backgroundColor?: string;
  scrollbarThumbColor?: string;
  renderStatic?: boolean;
  isStatic?: boolean;
  isStaticItem?: (item: T, index: number) => boolean;
  width?: number | string;
  overflowToBackbuffer?: boolean;
  scrollbar?: boolean;
  stableScrollback?: boolean;
  copyModeEnabled?: boolean;
  fixedItemHeight?: boolean;
  containerHeight?: number;
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

const VirtualizedListItem = memo(
  ({
    content,
    shouldBeStatic,
    width,
    containerWidth,
    itemKey,
    index,
    onSetRef,
  }: {
    content: React.ReactElement;
    shouldBeStatic: boolean;
    width: number | string | undefined;
    containerWidth: number;
    itemKey: string;
    index: number;
    onSetRef: (index: number, el: DOMElement | null) => void;
  }) => {
    const itemRef = useCallback(
      (el: DOMElement | null) => {
        onSetRef(index, el);
      },
      [index, onSetRef],
    );

    return (
      <Box width="100%" flexDirection="column" flexShrink={0} ref={itemRef}>
        {shouldBeStatic ? (
          <StaticRender
            width={typeof width === 'number' ? width : containerWidth}
            key={
              itemKey +
              '-static-' +
              (typeof width === 'number' ? width : containerWidth)
            }
          >
            {content}
          </StaticRender>
        ) : (
          content
        )}
      </Box>
    );
  },
);

VirtualizedListItem.displayName = 'VirtualizedListItem';

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
    renderStatic,
    isStatic,
    isStaticItem,
    width,
    overflowToBackbuffer,
    scrollbar = true,
    stableScrollback,
    copyModeEnabled = false,
    fixedItemHeight = false,
  } = props;
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

    if (typeof props.targetScrollIndex === 'number') {
      // NOTE: When targetScrollIndex is specified, we rely on the component
      // correctly tracking targetScrollIndex instead of initialScrollIndex.
      // We set isInitialScrollSet.current = true inside the second layout effect
      // to avoid it overwriting the targetScrollIndex.
      return {
        index: props.targetScrollIndex,
        offset: 0,
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
  const [containerWidth, setContainerWidth] = useState(0);
  const itemRefs = useRef<Array<DOMElement | null>>([]);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const isInitialScrollSet = useRef(false);

  const containerObserverRef = useRef<ResizeObserver | null>(null);
  const nodeToKeyRef = useRef(new WeakMap<DOMElement, string>());

  const onSetRef = useCallback((index: number, el: DOMElement | null) => {
    itemRefs.current[index] = el;
  }, []);

  const containerRefCallback = useCallback((node: DOMElement | null) => {
    containerObserverRef.current?.disconnect();
    containerRef.current = node;
    if (node) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const newHeight = Math.round(entry.contentRect.height);
          const newWidth = Math.round(entry.contentRect.width);
          setContainerHeight((prev) => (prev !== newHeight ? newHeight : prev));
          setContainerWidth((prev) => (prev !== newWidth ? newWidth : prev));
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

  const scrollableContainerHeight = props.containerHeight ?? containerHeight;

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

  const [prevTargetScrollIndex, setPrevTargetScrollIndex] = useState(
    props.targetScrollIndex,
  );
  const prevOffsetsLength = useRef(offsets.length);

  // NOTE: If targetScrollIndex is provided, and we haven't rendered items yet (offsets.length <= 1),
  // we do NOT set scrollAnchor yet, because actualScrollTop wouldn't know the real offset!
  // We wait until offsets populate.
  if (
    (props.targetScrollIndex !== undefined &&
      props.targetScrollIndex !== prevTargetScrollIndex &&
      offsets.length > 1) ||
    (props.targetScrollIndex !== undefined &&
      prevOffsetsLength.current <= 1 &&
      offsets.length > 1)
  ) {
    if (props.targetScrollIndex !== prevTargetScrollIndex) {
      setPrevTargetScrollIndex(props.targetScrollIndex);
    }
    prevOffsetsLength.current = offsets.length;
    setIsStickingToBottom(false);
    setScrollAnchor({ index: props.targetScrollIndex, offset: 0 });
  } else {
    prevOffsetsLength.current = offsets.length;
  }

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
      if (!isStickingToBottom) {
        setIsStickingToBottom(true);
      }
    }

    const listGrew = data.length > prevDataLength.current;
    const containerChanged =
      prevContainerHeight.current !== scrollableContainerHeight;

    // If targetScrollIndex is provided, we NEVER auto-snap to the bottom
    // because the parent is explicitly managing the scroll position.
    const shouldAutoScroll = props.targetScrollIndex === undefined;

    if (
      shouldAutoScroll &&
      ((listGrew && (isStickingToBottom || wasAtBottom)) ||
        (isStickingToBottom && containerChanged))
    ) {
      const newIndex = data.length > 0 ? data.length - 1 : 0;
      if (
        scrollAnchor.index !== newIndex ||
        scrollAnchor.offset !== SCROLL_TO_ITEM_END
      ) {
        setScrollAnchor({
          index: newIndex,
          offset: SCROLL_TO_ITEM_END,
        });
      }
      if (!isStickingToBottom) {
        setIsStickingToBottom(true);
      }
    } else if (
      (scrollAnchor.index >= data.length ||
        actualScrollTop > totalHeight - scrollableContainerHeight) &&
      data.length > 0
    ) {
      // We still clamp the scroll top if it's completely out of bounds
      const newScrollTop = Math.max(0, totalHeight - scrollableContainerHeight);
      const newAnchor = getAnchorForScrollTop(newScrollTop, offsets);
      if (
        scrollAnchor.index !== newAnchor.index ||
        scrollAnchor.offset !== newAnchor.offset
      ) {
        setScrollAnchor(newAnchor);
      }
    } else if (data.length === 0) {
      if (scrollAnchor.index !== 0 || scrollAnchor.offset !== 0) {
        setScrollAnchor({ index: 0, offset: 0 });
      }
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
    scrollAnchor.offset,
    getAnchorForScrollTop,
    offsets,
    isStickingToBottom,
    props.targetScrollIndex,
  ]);

  useLayoutEffect(() => {
    if (
      isInitialScrollSet.current ||
      offsets.length <= 1 ||
      totalHeight <= 0 ||
      scrollableContainerHeight <= 0
    ) {
      return;
    }

    if (props.targetScrollIndex !== undefined) {
      // If we are strictly driving from targetScrollIndex, do not apply initialScrollIndex
      isInitialScrollSet.current = true;
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
    scrollableContainerHeight,
    getAnchorForScrollTop,
    data.length,
    heights,
    props.targetScrollIndex,
  ]);

  const startIndex = Math.max(
    0,
    findLastIndex(offsets, (offset) => offset <= actualScrollTop) - 1,
  );
  const viewHeightForEndIndex =
    scrollableContainerHeight > 0 ? scrollableContainerHeight : 50;
  const endIndexOffset = offsets.findIndex(
    (offset) => offset > actualScrollTop + viewHeightForEndIndex,
  );
  const endIndex =
    endIndexOffset === -1
      ? data.length - 1
      : Math.min(data.length - 1, endIndexOffset);

  const topSpacerHeight =
    renderStatic === true || overflowToBackbuffer === true
      ? 0
      : (offsets[startIndex] ?? 0);
  const bottomSpacerHeight = renderStatic
    ? 0
    : totalHeight - (offsets[endIndex + 1] ?? totalHeight);

  // Maintain a stable set of observed nodes using useLayoutEffect
  const observedNodes = useRef<Set<DOMElement>>(new Set());
  useLayoutEffect(() => {
    const currentNodes = new Set<DOMElement>();
    const observeStart = renderStatic || overflowToBackbuffer ? 0 : startIndex;
    const observeEnd = renderStatic ? data.length - 1 : endIndex;

    for (let i = observeStart; i <= observeEnd; i++) {
      const node = itemRefs.current[i];
      const item = data[i];
      if (node && item) {
        currentNodes.add(node);
        const key = keyExtractor(item, i);
        // Always update the key mapping because React can reuse nodes at different indices/keys
        nodeToKeyRef.current.set(node, key);
        if (!isStatic && !fixedItemHeight && !observedNodes.current.has(node)) {
          itemsObserver.observe(node);
        }
      }
    }
    for (const node of observedNodes.current) {
      if (!currentNodes.has(node)) {
        if (!isStatic && !fixedItemHeight) {
          itemsObserver.unobserve(node);
        }
        nodeToKeyRef.current.delete(node);
      }
    }
    observedNodes.current = currentNodes;
  });

  const renderRangeStart =
    renderStatic || overflowToBackbuffer ? 0 : startIndex;
  const renderRangeEnd = renderStatic ? data.length - 1 : endIndex;

  // Always evaluate shouldBeStatic, width, etc. if we have a known width from the prop.
  // If containerHeight or containerWidth is 0 we defer rendering unless a static render or defined width overrides.
  // Wait, if it's not static and no width we need to wait for measure.
  // BUT the initial render MUST render *something* with a width if width prop is provided to avoid layout shifts.
  // We MUST wait for containerHeight > 0 before rendering, especially if renderStatic is true.
  // If containerHeight is 0, we will misclassify items as isOutsideViewport and permanently print them to StaticRender!
  const isReady =
    containerHeight > 0 ||
    process.env['NODE_ENV'] === 'test' ||
    (width !== undefined && typeof width === 'number');

  const renderedItems = useMemo(() => {
    if (!isReady) {
      return [];
    }

    const items = [];
    for (let i = renderRangeStart; i <= renderRangeEnd; i++) {
      const item = data[i];
      if (item) {
        const isOutsideViewport = i < startIndex || i > endIndex;
        const shouldBeStatic =
          (renderStatic === true && isOutsideViewport) ||
          isStaticItem?.(item, i) === true;

        const content = renderItem({ item, index: i });
        const key = keyExtractor(item, i);

        items.push(
          <VirtualizedListItem
            key={key}
            itemKey={key}
            content={content}
            shouldBeStatic={shouldBeStatic}
            width={width}
            containerWidth={containerWidth}
            index={i}
            onSetRef={onSetRef}
          />,
        );
      }
    }
    return items;
  }, [
    isReady,
    renderRangeStart,
    renderRangeEnd,
    data,
    startIndex,
    endIndex,
    renderStatic,
    isStaticItem,
    renderItem,
    keyExtractor,
    width,
    containerWidth,
    onSetRef,
  ]);

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
        const maxScroll = Math.max(0, totalHeight - scrollableContainerHeight);
        return {
          scrollTop: Math.min(getScrollTop(), maxScroll),
          scrollHeight: totalHeight,
          innerHeight: scrollableContainerHeight,
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
    ],
  );

  return (
    <Box
      ref={containerRefCallback}
      overflowY={copyModeEnabled ? 'hidden' : 'scroll'}
      overflowX="hidden"
      scrollTop={copyModeEnabled ? 0 : scrollTop}
      scrollbarThumbColor={props.scrollbarThumbColor ?? theme.text.secondary}
      backgroundColor={props.backgroundColor}
      width="100%"
      height="100%"
      flexDirection="column"
      paddingRight={copyModeEnabled ? 0 : 1}
      overflowToBackbuffer={overflowToBackbuffer}
      scrollbar={scrollbar}
      stableScrollback={stableScrollback}
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
