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
  useEffect,
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
  fixedItemHeight?: boolean;
  containerHeight?: number;
  maxScrollbackLength?: number;
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

const MemoizedStaticItem = memo(
  ({
    content,
    width,
    itemKey,
  }: {
    content: React.ReactElement;
    width: number;
    itemKey: string;
  }) => (
    <StaticRender width={width} key={itemKey}>
      {() => content}
    </StaticRender>
  ),
);

MemoizedStaticItem.displayName = 'MemoizedStaticItem';

const VirtualizedListItem = memo(
  ({
    content,
    itemKey,
    index,
    onSetRef,
  }: {
    content: React.ReactElement;
    itemKey: string;
    index: number;
    onSetRef: (index: number, itemKey: string, el: DOMElement | null) => void;
  }) => {
    const itemRef = useCallback(
      (el: DOMElement | null) => {
        onSetRef(index, itemKey, el);
      },
      [index, itemKey, onSetRef],
    );

    return (
      <Box width="100%" flexDirection="column" flexShrink={0} ref={itemRef}>
        {content}
      </Box>
    );
  },
);

VirtualizedListItem.displayName = 'VirtualizedListItem';

interface VirtualizedListInternalState {
  container: DOMElement | null;
  itemRefs: Array<DOMElement | null>;
  measuredHeights: number[];
  measuredKeys: string[];
  isInitialScrollSet: boolean;
  containerObserver: ResizeObserver | null;
  prevOffsetsLength: number;
  prevDataLength: number;
  prevTotalHeight: number;
  prevScrollTop: number;
  prevContainerHeight: number;
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
    renderStatic,
    isStatic,
    isStaticItem,
    width,
    overflowToBackbuffer,
    scrollbar = true,
    stableScrollback,
    maxScrollbackLength,
  } = props;

  const [scrollAnchor, setScrollAnchor] = useState<{
    index: number;
    offset: number;
    isBottom?: boolean;
  }>(() => {
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

  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [measurementVersion, setMeasurementVersion] = useState(0);

  const state = useRef<VirtualizedListInternalState>({
    container: null,
    itemRefs: [],
    measuredHeights: [],
    measuredKeys: [],
    isInitialScrollSet: false,
    containerObserver: null,
    prevOffsetsLength: -1,
    prevDataLength: -1,
    prevTotalHeight: -1,
    prevScrollTop: -1,
    prevContainerHeight: -1,
  });

  const itemsObserver = useMemo(
    () =>
      new ResizeObserver((entries) => {
        let changed = false;
        for (const entry of entries) {
          // Extract index and key safely from the element
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-assignment
          const target = entry.target as any;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const index = target._virtualIndex;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const key = target._virtualKey;
          if (typeof index === 'number' && key !== undefined) {
            const height = Math.round(entry.contentRect.height);
            // Ignore 0 height measurements which can happen when an element is unmounting
            if (
              height > 0 &&
              (state.current.measuredHeights[index] !== height ||
                state.current.measuredKeys[index] !== key)
            ) {
              state.current.measuredHeights[index] = height;
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              state.current.measuredKeys[index] = key;
              changed = true;
            }
          }
        }
        if (changed) {
          setMeasurementVersion((v) => v + 1);
        }
      }),
    [],
  );

  const onSetRef = useCallback(
    (index: number, itemKey: string, el: DOMElement | null) => {
      const oldEl = state.current.itemRefs[index];
      if (oldEl && oldEl !== el) {
        if (!isStatic) {
          itemsObserver.unobserve(oldEl);
        }
      }

      state.current.itemRefs[index] = el;

      if (el) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-assignment
        const target = el as any;

        target._virtualIndex = index;

        target._virtualKey = itemKey;
        if (!isStatic) {
          itemsObserver.observe(el);
        }
      }
    },
    [itemsObserver, isStatic],
  );

  const containerRefCallback = useCallback((node: DOMElement | null) => {
    state.current.containerObserver?.disconnect();
    state.current.container = node;
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
      state.current.containerObserver = observer;
    }
  }, []);

  useEffect(
    () => () => {
      state.current.containerObserver?.disconnect();
      itemsObserver.disconnect();
    },
    [itemsObserver],
  );

  const { totalHeight, offsets } = (() => {
    const offsets: number[] = [0];
    let totalHeight = 0;
    for (let i = 0; i < data.length; i++) {
      const key = keyExtractor(data[i], i);
      const cachedHeight =
        state.current.measuredKeys[i] === key
          ? state.current.measuredHeights[i]
          : undefined;
      const height = cachedHeight ?? estimatedItemHeight(i);
      totalHeight += height;
      offsets.push(totalHeight);
    }
    return { totalHeight, offsets };
  })();

  const scrollableContainerHeight = props.containerHeight ?? containerHeight;

  const getAnchorForScrollTop = useCallback(
    (
      scrollTop: number,
      offsets: number[],
      totalHeight: number,
      scrollableContainerHeight: number,
    ): { index: number; offset: number; isBottom?: boolean } => {
      const isNearBottom =
        totalHeight > 0 &&
        scrollTop > (totalHeight - scrollableContainerHeight) / 2;

      if (isNearBottom) {
        const scrollBottom = scrollTop + scrollableContainerHeight;
        const index = findLastIndex(
          offsets,
          (offset) => offset <= scrollBottom,
        );
        if (index === -1) {
          return { index: 0, offset: 0, isBottom: true };
        }
        return {
          index,
          offset: scrollBottom - offsets[index],
          isBottom: true,
        };
      }

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

  // NOTE: If targetScrollIndex is provided, and we haven't rendered items yet (offsets.length <= 1),
  // we do NOT set scrollAnchor yet, because actualScrollTop wouldn't know the real offset!
  // We wait until offsets populate.
  if (
    (props.targetScrollIndex !== undefined &&
      props.targetScrollIndex !== prevTargetScrollIndex &&
      offsets.length > 1) ||
    (props.targetScrollIndex !== undefined &&
      state.current.prevOffsetsLength <= 1 &&
      offsets.length > 1)
  ) {
    if (props.targetScrollIndex !== prevTargetScrollIndex) {
      setPrevTargetScrollIndex(props.targetScrollIndex);
    }
    state.current.prevOffsetsLength = offsets.length;
    setIsStickingToBottom(false);
    setScrollAnchor({ index: props.targetScrollIndex, offset: 0 });
  } else if (offsets.length > 1) {
    state.current.prevOffsetsLength = offsets.length;
  }

  const actualScrollTop = useMemo(() => {
    const offset = offsets[scrollAnchor.index];
    if (typeof offset !== 'number') {
      return 0;
    }

    if (scrollAnchor.offset === SCROLL_TO_ITEM_END) {
      const item = data[scrollAnchor.index];
      const key = item ? keyExtractor(item, scrollAnchor.index) : '';
      const cachedHeight =
        state.current.measuredKeys[scrollAnchor.index] === key
          ? state.current.measuredHeights[scrollAnchor.index]
          : undefined;
      const itemHeight =
        cachedHeight ?? estimatedItemHeight(scrollAnchor.index) ?? 0;
      return offset + itemHeight - scrollableContainerHeight;
    }

    if (scrollAnchor.isBottom) {
      return offset + scrollAnchor.offset - scrollableContainerHeight;
    }

    return offset + scrollAnchor.offset;
  }, [
    scrollAnchor,
    offsets,
    scrollableContainerHeight,
    data,
    keyExtractor,
    estimatedItemHeight,
  ]);

  const scrollTop = isStickingToBottom
    ? Number.MAX_SAFE_INTEGER
    : actualScrollTop;

  useLayoutEffect(() => {
    if (state.current.prevDataLength === -1) {
      state.current.prevDataLength = data.length;
      state.current.prevTotalHeight = totalHeight;
      state.current.prevScrollTop = actualScrollTop;
      state.current.prevContainerHeight = scrollableContainerHeight;
      return;
    }

    const contentPreviouslyFit =
      state.current.prevTotalHeight <= state.current.prevContainerHeight;
    const wasScrolledToBottomPixels =
      state.current.prevScrollTop >=
      state.current.prevTotalHeight - state.current.prevContainerHeight - 1;
    const wasAtBottom = contentPreviouslyFit || wasScrolledToBottomPixels;

    if (wasAtBottom && actualScrollTop >= state.current.prevScrollTop) {
      if (!isStickingToBottom) {
        setIsStickingToBottom(true);
      }
    }

    const listGrew = data.length > state.current.prevDataLength;
    const containerChanged =
      state.current.prevContainerHeight !== scrollableContainerHeight;

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
      const newAnchor = getAnchorForScrollTop(
        newScrollTop,
        offsets,
        totalHeight,
        scrollableContainerHeight,
      );
      if (
        scrollAnchor.index !== newAnchor.index ||
        scrollAnchor.offset !== newAnchor.offset ||
        scrollAnchor.isBottom !== newAnchor.isBottom
      ) {
        setScrollAnchor(newAnchor);
      }
    } else if (data.length === 0) {
      if (
        scrollAnchor.index !== 0 ||
        scrollAnchor.offset !== 0 ||
        scrollAnchor.isBottom !== undefined
      ) {
        setScrollAnchor({ index: 0, offset: 0 });
      }
    }

    state.current.prevDataLength = data.length;
    state.current.prevTotalHeight = totalHeight;
    state.current.prevScrollTop = actualScrollTop;
    state.current.prevContainerHeight = scrollableContainerHeight;
  }, [
    data.length,
    totalHeight,
    actualScrollTop,
    scrollableContainerHeight,
    scrollAnchor.index,
    scrollAnchor.offset,
    scrollAnchor.isBottom,
    getAnchorForScrollTop,
    offsets,
    isStickingToBottom,
    props.targetScrollIndex,
  ]);

  useLayoutEffect(() => {
    if (
      state.current.isInitialScrollSet ||
      offsets.length <= 1 ||
      totalHeight <= 0 ||
      scrollableContainerHeight <= 0
    ) {
      return;
    }

    if (props.targetScrollIndex !== undefined) {
      // If we are strictly driving from targetScrollIndex, do not apply initialScrollIndex
      state.current.isInitialScrollSet = true;
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
        state.current.isInitialScrollSet = true;
        return;
      }

      const index = Math.max(0, Math.min(data.length - 1, initialScrollIndex));
      const offset = initialScrollOffsetInIndex ?? 0;
      const newScrollTop = (offsets[index] ?? 0) + offset;

      const clampedScrollTop = Math.max(
        0,
        Math.min(totalHeight - scrollableContainerHeight, newScrollTop),
      );

      setScrollAnchor(
        getAnchorForScrollTop(
          clampedScrollTop,
          offsets,
          totalHeight,
          scrollableContainerHeight,
        ),
      );
      state.current.isInitialScrollSet = true;
    }
  }, [
    initialScrollIndex,
    initialScrollOffsetInIndex,
    offsets,
    totalHeight,
    scrollableContainerHeight,
    getAnchorForScrollTop,
    data.length,
    measurementVersion,
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

  const renderRangeStart = useMemo(() => {
    if (overflowToBackbuffer) {
      if (typeof maxScrollbackLength === 'number' && maxScrollbackLength > 0) {
        const targetOffset = Math.max(0, actualScrollTop - maxScrollbackLength);
        const index = findLastIndex(
          offsets,
          (offset) => offset <= targetOffset,
        );
        return Math.max(0, index - 1);
      }
      return 0;
    }
    return startIndex;
  }, [
    overflowToBackbuffer,
    maxScrollbackLength,
    actualScrollTop,
    offsets,
    startIndex,
  ]);

  const topSpacerHeight = offsets[renderRangeStart];
  const bottomSpacerHeight =
    totalHeight - (offsets[endIndex + 1] ?? totalHeight);

  const renderRangeEnd = endIndex;

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

        if (shouldBeStatic) {
          items.push(
            <MemoizedStaticItem
              key={`${key}-static`}
              itemKey={`${key}-static-${typeof width === 'number' ? width : containerWidth}`}
              width={typeof width === 'number' ? width : containerWidth}
              content={content}
            />,
          );
        } else {
          items.push(
            <VirtualizedListItem
              key={key}
              itemKey={key}
              content={content}
              index={i}
              onSetRef={onSetRef}
            />,
          );
        }

        if (
          !renderStatic &&
          state.current.measuredKeys[i] !== key &&
          !shouldBeStatic
        ) {
          const fillerHeight = Math.max(0, estimatedItemHeight(i) - 1);
          if (fillerHeight > 0) {
            items.push(
              <Box
                key={key + '-filler'}
                height={fillerHeight}
                flexShrink={0}
              />,
            );
          }
        }
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
    estimatedItemHeight,
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
          getAnchorForScrollTop(
            Math.min(newScrollTop, maxScroll),
            offsets,
            totalHeight,
            scrollableContainerHeight,
          ),
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
          setScrollAnchor(
            getAnchorForScrollTop(
              newScrollTop,
              offsets,
              totalHeight,
              scrollableContainerHeight,
            ),
          );
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
          setScrollAnchor(
            getAnchorForScrollTop(
              newScrollTop,
              offsets,
              totalHeight,
              scrollableContainerHeight,
            ),
          );
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
            setScrollAnchor(
              getAnchorForScrollTop(
                newScrollTop,
                offsets,
                totalHeight,
                scrollableContainerHeight,
              ),
            );
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
      overflowY="scroll"
      overflowX="hidden"
      scrollTop={scrollTop}
      scrollbarThumbColor={props.scrollbarThumbColor ?? theme.text.secondary}
      backgroundColor={props.backgroundColor}
      width="100%"
      height="100%"
      flexDirection="column"
      paddingRight={1}
      overflowToBackbuffer={overflowToBackbuffer}
      scrollbar={scrollbar}
      stableScrollback={stableScrollback}
    >
      <Box flexShrink={0} width="100%" flexDirection="column">
        {topSpacerHeight > 0 ? (
          <Box height={topSpacerHeight} flexShrink={0} />
        ) : null}
        {renderedItems}
        {bottomSpacerHeight > 0 ? (
          <Box height={bottomSpacerHeight} flexShrink={0} />
        ) : null}
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
