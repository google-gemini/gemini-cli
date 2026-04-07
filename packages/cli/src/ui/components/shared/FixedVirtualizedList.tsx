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
  useMemo,
  useCallback,
  memo,
} from 'react';
import type React from 'react';
import { theme } from '../../semantic-colors.js';
import { useBatchedScroll } from '../../hooks/useBatchedScroll.js';

import { Box, StaticRender } from 'ink';

export const SCROLL_TO_ITEM_END = Number.MAX_SAFE_INTEGER;

export type FixedVirtualizedListProps<T> = {
  data: T[];
  renderItem: (info: { item: T; index: number }) => React.ReactElement;
  itemHeight: number;
  keyExtractor: (item: T, index: number) => string;
  initialScrollIndex?: number;
  initialScrollOffsetInIndex?: number;
  targetScrollIndex?: number;
  backgroundColor?: string;
  scrollbarThumbColor?: string;
  renderStatic?: boolean;
  isStaticItem?: (item: T, index: number) => boolean;
  width: number;
  overflowToBackbuffer?: boolean;
  scrollbar?: boolean;
  stableScrollback?: boolean;
  maxHeight: number;
  maxScrollbackLength?: number;
};

export type FixedVirtualizedListRef<T> = {
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

const FixedVirtualizedListItem = memo(
  ({
    content,
    shouldBeStatic,
    width,
    itemKey,
  }: {
    content: React.ReactElement;
    shouldBeStatic: boolean;
    width: number;
    itemKey: string;
  }) => (
    <Box width="100%" flexDirection="column" flexShrink={0}>
      {shouldBeStatic ? (
        <StaticRender width={width} key={itemKey + '-static-' + width}>
          {() => content}
        </StaticRender>
      ) : (
        content
      )}
    </Box>
  ),
);

FixedVirtualizedListItem.displayName = 'FixedVirtualizedListItem';

function FixedVirtualizedList<T>(
  props: FixedVirtualizedListProps<T>,
  ref: React.Ref<FixedVirtualizedListRef<T>>,
) {
  const {
    data,
    renderItem,
    itemHeight,
    keyExtractor,
    initialScrollIndex,
    initialScrollOffsetInIndex,
    renderStatic,
    isStaticItem,
    width,
    overflowToBackbuffer,
    scrollbar = true,
    stableScrollback,
    maxScrollbackLength,
    maxHeight,
  } = props;

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

  const totalHeight = data.length * itemHeight;
  const scrollableContainerHeight = maxHeight;
  const isInitialScrollSet = useRef(false);

  const getAnchorForScrollTop = useCallback(
    (scrollTop: number): { index: number; offset: number } => {
      const index = Math.max(
        0,
        Math.min(data.length - 1, Math.floor(scrollTop / itemHeight)),
      );
      if (data.length === 0) {
        return { index: 0, offset: 0 };
      }
      return { index, offset: scrollTop - index * itemHeight };
    },
    [data.length, itemHeight],
  );

  const [prevTargetScrollIndex, setPrevTargetScrollIndex] = useState(
    props.targetScrollIndex,
  );
  const prevDataLength = useRef(data.length);

  if (
    (props.targetScrollIndex !== undefined &&
      props.targetScrollIndex !== prevTargetScrollIndex &&
      data.length > 0) ||
    (props.targetScrollIndex !== undefined &&
      prevDataLength.current === 0 &&
      data.length > 0)
  ) {
    if (props.targetScrollIndex !== prevTargetScrollIndex) {
      setPrevTargetScrollIndex(props.targetScrollIndex);
    }
    prevDataLength.current = data.length;
    setIsStickingToBottom(false);
    setScrollAnchor({ index: props.targetScrollIndex, offset: 0 });
  } else {
    prevDataLength.current = data.length;
  }

  const rawStateActualScrollTop = (() => {
    const offset = scrollAnchor.index * itemHeight;
    if (scrollAnchor.offset === SCROLL_TO_ITEM_END) {
      return offset + itemHeight - scrollableContainerHeight;
    }
    return offset + scrollAnchor.offset;
  })();
  const maxScroll = Math.max(0, totalHeight - scrollableContainerHeight);
  const stateActualScrollTop = Math.max(
    0,
    Math.min(maxScroll, rawStateActualScrollTop),
  );

  const prevTotalHeight = useRef(totalHeight);
  const prevScrollTop = useRef(rawStateActualScrollTop);
  const prevContainerHeight = useRef(scrollableContainerHeight);

  // Render-time state derivation to avoid useEffect for static rendering
  let currentScrollAnchor = scrollAnchor;
  let currentIsStickingToBottom = isStickingToBottom;

  const contentPreviouslyFit =
    prevTotalHeight.current <= prevContainerHeight.current;
  const wasScrolledToBottomPixels =
    prevScrollTop.current >=
    prevTotalHeight.current - prevContainerHeight.current - 1;

  // Crucial fix: we were previously only evaluating wasAtBottom against rawStateActualScrollTop *if* it was at bottom *last* frame.
  // But if the content just exceeded the container height, wasScrolledToBottomPixels is false, but contentPreviouslyFit is true.
  // If it previously fit, it implicitly means we should stick to the bottom if the new height exceeds the container.
  const wasAtBottom = contentPreviouslyFit || wasScrolledToBottomPixels;

  if (
    wasAtBottom &&
    (rawStateActualScrollTop >= prevScrollTop.current || contentPreviouslyFit)
  ) {
    if (!currentIsStickingToBottom) {
      currentIsStickingToBottom = true;
      if (scrollAnchor === currentScrollAnchor) {
        // Avoid infinite loop if we already updated state
        setIsStickingToBottom(true);
      }
    }
  }

  const listGrew = data.length > prevDataLength.current;
  const containerChanged =
    prevContainerHeight.current !== scrollableContainerHeight;
  const shouldAutoScroll = props.targetScrollIndex === undefined;

  if (
    shouldAutoScroll &&
    ((listGrew && (currentIsStickingToBottom || wasAtBottom)) ||
      (currentIsStickingToBottom && containerChanged))
  ) {
    const newIndex = data.length > 0 ? data.length - 1 : 0;
    if (
      currentScrollAnchor.index !== newIndex ||
      currentScrollAnchor.offset !== SCROLL_TO_ITEM_END
    ) {
      currentScrollAnchor = {
        index: newIndex,
        offset: SCROLL_TO_ITEM_END,
      };
      setScrollAnchor(currentScrollAnchor);
    }
    if (!currentIsStickingToBottom) {
      currentIsStickingToBottom = true;
      setIsStickingToBottom(true);
    }
  } else if (
    (currentScrollAnchor.index >= data.length ||
      stateActualScrollTop > totalHeight - scrollableContainerHeight) &&
    data.length > 0
  ) {
    const newScrollTop = Math.max(0, totalHeight - scrollableContainerHeight);
    const newAnchor = getAnchorForScrollTop(newScrollTop);
    if (
      currentScrollAnchor.index !== newAnchor.index ||
      currentScrollAnchor.offset !== newAnchor.offset
    ) {
      currentScrollAnchor = newAnchor;
      setScrollAnchor(newAnchor);
    }
  } else if (data.length === 0) {
    if (currentScrollAnchor.index !== 0 || currentScrollAnchor.offset !== 0) {
      currentScrollAnchor = { index: 0, offset: 0 };
      setScrollAnchor(currentScrollAnchor);
    }
  }

  // Initial scroll setup during render
  if (
    !isInitialScrollSet.current &&
    data.length > 0 &&
    totalHeight > 0 &&
    scrollableContainerHeight > 0
  ) {
    if (props.targetScrollIndex !== undefined) {
      isInitialScrollSet.current = true;
    } else if (typeof initialScrollIndex === 'number') {
      const scrollToEnd =
        initialScrollIndex === SCROLL_TO_ITEM_END ||
        (initialScrollIndex >= data.length - 1 &&
          initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);

      if (scrollToEnd) {
        currentScrollAnchor = {
          index: data.length - 1,
          offset: SCROLL_TO_ITEM_END,
        };
        setScrollAnchor(currentScrollAnchor);
        currentIsStickingToBottom = true;
        setIsStickingToBottom(true);
        isInitialScrollSet.current = true;
      } else {
        const index = Math.max(
          0,
          Math.min(data.length - 1, initialScrollIndex),
        );
        const offset = initialScrollOffsetInIndex ?? 0;
        const newScrollTop = index * itemHeight + offset;

        const clampedScrollTop = Math.max(
          0,
          Math.min(totalHeight - scrollableContainerHeight, newScrollTop),
        );

        currentScrollAnchor = getAnchorForScrollTop(clampedScrollTop);
        setScrollAnchor(currentScrollAnchor);
        isInitialScrollSet.current = true;
      }
    }
  }

  // After all derived state updates, update refs for the next render
  prevDataLength.current = data.length;
  prevTotalHeight.current = totalHeight;

  const rawDerivedActualScrollTop = (() => {
    const offset = currentScrollAnchor.index * itemHeight;
    if (currentScrollAnchor.offset === SCROLL_TO_ITEM_END) {
      return offset + itemHeight - scrollableContainerHeight;
    }
    return offset + currentScrollAnchor.offset;
  })();
  const derivedActualScrollTop = Math.max(
    0,
    Math.min(maxScroll, rawDerivedActualScrollTop),
  );

  prevScrollTop.current = rawDerivedActualScrollTop;
  prevContainerHeight.current = scrollableContainerHeight;

  const scrollTop = currentIsStickingToBottom
    ? Number.MAX_SAFE_INTEGER
    : derivedActualScrollTop;

  const startIndex = Math.max(
    0,
    Math.floor(derivedActualScrollTop / itemHeight) - 1,
  );
  const viewHeightForEndIndex =
    scrollableContainerHeight > 0 ? scrollableContainerHeight : 50;

  const maxEndIndex = data.length - 1;
  const endIndex = Math.min(
    maxEndIndex,
    Math.ceil((derivedActualScrollTop + viewHeightForEndIndex) / itemHeight),
  );

  const renderRangeStart = (() => {
    if (renderStatic) return 0;
    if (overflowToBackbuffer) {
      if (typeof maxScrollbackLength === 'number' && maxScrollbackLength > 0) {
        const targetOffset = Math.max(
          0,
          derivedActualScrollTop - maxScrollbackLength,
        );
        const index = Math.floor(targetOffset / itemHeight);
        return Math.max(0, index - 1);
      }
      return 0;
    }
    return startIndex;
  })();

  const renderRangeEnd = renderStatic ? maxEndIndex : endIndex;

  const topSpacerHeight = renderRangeStart * itemHeight;
  const bottomSpacerHeight = renderStatic
    ? 0
    : totalHeight - (renderRangeEnd + 1) * itemHeight;

  const renderedItems = useMemo(() => {
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
          <FixedVirtualizedListItem
            key={key}
            itemKey={key}
            content={content}
            shouldBeStatic={shouldBeStatic}
            width={width}
          />,
        );
      }
    }
    return items;
  }, [
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
          getAnchorForScrollTop(Math.min(newScrollTop, maxScroll)),
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
          setScrollAnchor(getAnchorForScrollTop(newScrollTop));
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
        const offset = index * itemHeight;
        if (index >= 0 && index < data.length) {
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
          setScrollAnchor(getAnchorForScrollTop(newScrollTop));
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
          const offset = index * itemHeight;
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
          setScrollAnchor(getAnchorForScrollTop(newScrollTop));
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
      scrollAnchor,
      totalHeight,
      getAnchorForScrollTop,
      data,
      scrollableContainerHeight,
      getScrollTop,
      setPendingScrollTop,
      itemHeight,
    ],
  );

  return (
    <Box
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
        <Box height={topSpacerHeight} flexShrink={0} />
        {renderedItems}
        <Box height={Math.max(0, bottomSpacerHeight)} flexShrink={0} />
      </Box>
    </Box>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const FixedVirtualizedListWithForwardRef = forwardRef(FixedVirtualizedList) as <
  T,
>(
  props: FixedVirtualizedListProps<T> & {
    ref?: React.Ref<FixedVirtualizedListRef<T>>;
  },
) => React.ReactElement;

export { FixedVirtualizedListWithForwardRef as FixedVirtualizedList };

FixedVirtualizedList.displayName = 'FixedVirtualizedList';
