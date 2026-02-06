/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
  useCallback,
  useReducer,
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

type ScrollAnchor = { index: number; offset: number };

type State = {
  scrollAnchor: ScrollAnchor;
  isStickingToBottom: boolean;
  containerHeight: number;
  heights: number[];
  prevDataLength: number;
  prevTotalHeight: number;
  prevScrollTop: number;
  prevContainerHeight: number;
  isInitialScrollSet: boolean;
};

type Action =
  | { type: 'SET_CONTAINER_HEIGHT'; height: number }
  | {
      type: 'UPDATE_ITEM_HEIGHTS';
      updates: Array<{ index: number; height: number }>;
    }
  | { type: 'SYNC_SCROLL' }
  | {
      type: 'SET_DATA';
      dataLength: number;
      estimatedItemHeight: (index: number) => number;
    }
  | { type: 'SCROLL_TO'; anchor: ScrollAnchor; sticking?: boolean };

function getAnchorForScrollTop(
  scrollTop: number,
  offsets: number[],
): ScrollAnchor {
  const index = findLastIndex(offsets, (offset) => offset <= scrollTop);
  if (index === -1) {
    return { index: 0, offset: 0 };
  }
  return { index, offset: scrollTop - offsets[index] };
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

  const [state, dispatch] = useReducer(
    (state: State, action: Action): State => {
      const getDerived = (heights: number[], dataLength: number) => {
        const offsets: number[] = [0];
        let totalHeight = 0;
        for (let i = 0; i < dataLength; i++) {
          const height = heights[i] ?? estimatedItemHeight(i);
          totalHeight += height;
          offsets.push(totalHeight);
        }
        return { totalHeight, offsets };
      };

      const getScrollTop = (
        anchor: ScrollAnchor,
        offsets: number[],
        heights: number[],
        containerHeight: number,
      ) => {
        const offset = offsets[anchor.index];
        if (typeof offset !== 'number') return 0;
        if (anchor.offset === SCROLL_TO_ITEM_END) {
          const itemHeight = heights[anchor.index] ?? 0;
          return Math.max(0, offset + itemHeight - containerHeight);
        }
        return offset + anchor.offset;
      };

      const syncScrollInternal = (
        s: State,
        nextHeights?: number[],
        nextDataLength?: number,
      ): State => {
        const heights = nextHeights ?? s.heights;
        const dataLength = nextDataLength ?? s.prevDataLength;
        const { totalHeight, offsets } = getDerived(heights, dataLength);

        let nextAnchor = s.scrollAnchor;
        let nextSticking = s.isStickingToBottom;
        let nextInitialSet = s.isInitialScrollSet;

        const currentScrollTop = getScrollTop(
          nextAnchor,
          offsets,
          heights,
          s.containerHeight,
        );

        // Initial scroll - only apply once we have measurements
        if (
          !nextInitialSet &&
          offsets.length > 1 &&
          totalHeight > 0 &&
          s.containerHeight > 0
        ) {
          if (typeof initialScrollIndex === 'number') {
            const scrollToEnd =
              initialScrollIndex === SCROLL_TO_ITEM_END ||
              (initialScrollIndex >= dataLength - 1 &&
                initialScrollOffsetInIndex === SCROLL_TO_ITEM_END);

            if (scrollToEnd) {
              nextAnchor = {
                index: dataLength > 0 ? dataLength - 1 : 0,
                offset: SCROLL_TO_ITEM_END,
              };
              nextSticking = true;
            } else {
              const index = Math.max(
                0,
                Math.min(dataLength - 1, initialScrollIndex),
              );
              const offset = initialScrollOffsetInIndex ?? 0;
              const targetTop = (offsets[index] ?? 0) + offset;
              const clampedTop = Math.max(
                0,
                Math.min(totalHeight - s.containerHeight, targetTop),
              );
              nextAnchor = getAnchorForScrollTop(clampedTop, offsets);
              nextSticking =
                clampedTop >= totalHeight - s.containerHeight - 1 &&
                totalHeight > s.containerHeight;
            }
          }
          nextInitialSet = true;
        } else {
          // Normal sync logic
          const wasAtBottom =
            s.prevTotalHeight <= s.prevContainerHeight ||
            s.prevScrollTop >= s.prevTotalHeight - s.prevContainerHeight - 1;

          if (
            wasAtBottom &&
            currentScrollTop >= s.prevScrollTop &&
            totalHeight > s.containerHeight
          ) {
            nextSticking = true;
          }

          const listGrew = dataLength > s.prevDataLength;
          const containerChanged = s.prevContainerHeight !== s.containerHeight;

          if (
            (listGrew && (nextSticking || wasAtBottom)) ||
            (nextSticking && containerChanged)
          ) {
            nextAnchor = {
              index: dataLength > 0 ? dataLength - 1 : 0,
              offset: SCROLL_TO_ITEM_END,
            };
            nextSticking = true;
          } else if (
            (nextAnchor.index >= dataLength ||
              (s.containerHeight > 0 &&
                currentScrollTop > totalHeight - s.containerHeight)) &&
            dataLength > 0
          ) {
            const newTop = Math.max(0, totalHeight - s.containerHeight);
            nextAnchor = getAnchorForScrollTop(newTop, offsets);
          } else if (dataLength === 0) {
            nextAnchor = { index: 0, offset: 0 };
            nextSticking = false;
          }
        }

        return {
          ...s,
          heights,
          prevDataLength: dataLength,
          scrollAnchor: nextAnchor,
          isStickingToBottom: nextSticking,
          isInitialScrollSet: nextInitialSet,
          prevTotalHeight: totalHeight,
          prevScrollTop: getScrollTop(
            nextAnchor,
            offsets,
            heights,
            s.containerHeight,
          ),
          prevContainerHeight: s.containerHeight,
        };
      };

      switch (action.type) {
        case 'SET_CONTAINER_HEIGHT':
          if (state.containerHeight === action.height) return state;
          return syncScrollInternal({
            ...state,
            containerHeight: action.height,
          });
        case 'UPDATE_ITEM_HEIGHTS': {
          const newHeights = [...state.heights];
          let changed = false;
          for (const { index, height } of action.updates) {
            if (newHeights[index] !== height) {
              newHeights[index] = height;
              changed = true;
            }
          }
          if (!changed) return state;
          return syncScrollInternal(state, newHeights);
        }
        case 'SET_DATA': {
          if (action.dataLength === state.prevDataLength) return state;
          const newHeights = [...state.heights];
          if (action.dataLength < newHeights.length) {
            newHeights.length = action.dataLength;
          } else {
            for (let i = newHeights.length; i < action.dataLength; i++) {
              newHeights[i] = action.estimatedItemHeight(i);
            }
          }
          return syncScrollInternal(state, newHeights, action.dataLength);
        }
        case 'SYNC_SCROLL':
          return syncScrollInternal(state);
        case 'SCROLL_TO': {
          const { heights, prevDataLength, containerHeight } = state;
          const { offsets, totalHeight } = getDerived(heights, prevDataLength);
          const newTop = getScrollTop(
            action.anchor,
            offsets,
            heights,
            containerHeight,
          );
          return {
            ...state,
            scrollAnchor: action.anchor,
            isStickingToBottom:
              action.sticking ??
              (containerHeight > 0 &&
                newTop >= totalHeight - containerHeight - 1),
            prevScrollTop: newTop,
          };
        }
        default:
          return state;
      }
    },
    {
      scrollAnchor: { index: 0, offset: 0 },
      isStickingToBottom: false,
      containerHeight: 0,
      heights: data.map((_, i) => estimatedItemHeight(i)),
      prevDataLength: data.length,
      prevTotalHeight: 0,
      prevScrollTop: 0,
      prevContainerHeight: 0,
      isInitialScrollSet: false,
    },
  );

  const { scrollAnchor, containerHeight, heights } = state;

  useEffect(() => {
    dispatch({
      type: 'SET_DATA',
      dataLength: data.length,
      estimatedItemHeight,
    });
  }, [data.length, estimatedItemHeight]);

  const { totalHeight, offsets } = useMemo(() => {
    const offsets: number[] = [0];
    let totalHeight = 0;
    for (let i = 0; i < data.length; i++) {
      const height = heights[i] ?? estimatedItemHeight(i);
      totalHeight += height;
      offsets.push(totalHeight);
    }
    return { totalHeight, offsets };
  }, [heights, data.length, estimatedItemHeight]);

  const scrollTop = useMemo(() => {
    const offset = offsets[scrollAnchor.index];
    if (typeof offset !== 'number') return 0;
    if (scrollAnchor.offset === SCROLL_TO_ITEM_END) {
      const itemHeight = heights[scrollAnchor.index] ?? 0;
      return Math.max(0, offset + itemHeight - containerHeight);
    }
    return offset + scrollAnchor.offset;
  }, [scrollAnchor, offsets, heights, containerHeight]);

  const itemRefs = useRef<Array<DOMElement | null>>([]);
  const elementToIndexRef = useRef(new Map<DOMElement, number>());
  const itemsObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => () => itemsObserverRef.current?.disconnect(), []);

  const setItemRef = useCallback((el: DOMElement | null, index: number) => {
    const prevEl = itemRefs.current[index];
    if (prevEl === el) return;
    if (prevEl && itemsObserverRef.current) {
      itemsObserverRef.current.unobserve(prevEl);
      elementToIndexRef.current.delete(prevEl);
    }
    itemRefs.current[index] = el;
    if (el) {
      elementToIndexRef.current.set(el, index);
      if (!itemsObserverRef.current) {
        itemsObserverRef.current = new ResizeObserver((entries) => {
          const updates = entries
            .map((entry) => {
              const idx = elementToIndexRef.current.get(entry.target);
              return idx !== undefined
                ? { index: idx, height: Math.round(entry.contentRect.height) }
                : null;
            })
            .filter((u): u is { index: number; height: number } => u !== null);

          if (updates.length > 0) {
            dispatch({ type: 'UPDATE_ITEM_HEIGHTS', updates });
          }
        });
      }
      itemsObserverRef.current.observe(el);
    }
  }, []);

  const containerRef = useRef<DOMElement>(null);
  const containerObserverRef = useRef<ResizeObserver | null>(null);
  const setContainerRef = useCallback((node: DOMElement | null) => {
    containerObserverRef.current?.disconnect();
    (containerRef as React.MutableRefObject<DOMElement | null>).current = node;
    if (node) {
      dispatch({
        type: 'SET_CONTAINER_HEIGHT',
        height: Math.round(measureElement(node).height),
      });
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry)
          dispatch({
            type: 'SET_CONTAINER_HEIGHT',
            height: Math.round(entry.contentRect.height),
          });
      });
      observer.observe(node);
      containerObserverRef.current = observer;
    }
  }, []);

  const innerObserverRef = useRef<ResizeObserver | null>(null);
  const setInnerRef = useCallback((node: DOMElement | null) => {
    innerObserverRef.current?.disconnect();
    if (node) {
      dispatch({ type: 'SYNC_SCROLL' });
      const observer = new ResizeObserver(() =>
        dispatch({ type: 'SYNC_SCROLL' }),
      );
      observer.observe(node);
      innerObserverRef.current = observer;
    }
  }, []);

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
        <Box
          key={keyExtractor(item, i)}
          width="100%"
          ref={(el) => setItemRef(el, i)}
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
        const currentTop = getScrollTop();
        const newTop = Math.max(
          0,
          Math.min(totalHeight - containerHeight, currentTop + delta),
        );
        setPendingScrollTop(newTop);
        dispatch({
          type: 'SCROLL_TO',
          anchor: getAnchorForScrollTop(newTop, offsets),
        });
      },
      scrollTo: (offset: number) => {
        const newTop = Math.max(
          0,
          Math.min(totalHeight - containerHeight, offset),
        );
        setPendingScrollTop(newTop);
        dispatch({
          type: 'SCROLL_TO',
          anchor: getAnchorForScrollTop(newTop, offsets),
        });
      },
      scrollToEnd: () => {
        if (data.length > 0) {
          dispatch({
            type: 'SCROLL_TO',
            anchor: { index: data.length - 1, offset: SCROLL_TO_ITEM_END },
            sticking: true,
          });
        }
      },
      scrollToIndex: ({ index, viewOffset = 0, viewPosition = 0 }) => {
        const offset = offsets[index];
        if (offset !== undefined) {
          const newTop = Math.max(
            0,
            Math.min(
              totalHeight - containerHeight,
              offset - viewPosition * containerHeight + viewOffset,
            ),
          );
          setPendingScrollTop(newTop);
          dispatch({
            type: 'SCROLL_TO',
            anchor: getAnchorForScrollTop(newTop, offsets),
          });
        }
      },
      scrollToItem: ({ item, viewOffset = 0, viewPosition = 0 }) => {
        const index = data.indexOf(item);
        if (index !== -1) {
          const offset = offsets[index];
          if (offset !== undefined) {
            const newTop = Math.max(
              0,
              Math.min(
                totalHeight - containerHeight,
                offset - viewPosition * containerHeight + viewOffset,
              ),
            );
            setPendingScrollTop(newTop);
            dispatch({
              type: 'SCROLL_TO',
              anchor: getAnchorForScrollTop(newTop, offsets),
            });
          }
        }
      },
      getScrollIndex: () => scrollAnchor.index,
      getScrollState: () => ({
        scrollTop: getScrollTop(),
        scrollHeight: totalHeight,
        innerHeight: containerHeight,
      }),
    }),
    [
      offsets,
      scrollAnchor,
      totalHeight,
      data,
      containerHeight,
      getScrollTop,
      setPendingScrollTop,
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
      <Box ref={setInnerRef} flexShrink={0} width="100%" flexDirection="column">
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
