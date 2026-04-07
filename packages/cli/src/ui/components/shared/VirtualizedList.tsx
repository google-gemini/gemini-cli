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
  createContext,
} from 'react';
import type React from 'react';
import { theme } from '../../semantic-colors.js';
import { useBatchedScroll } from '../../hooks/useBatchedScroll.js';

import {
  type DOMElement,
  Box,
  ResizeObserver,
  StaticRender,
  getBoundingBox,
  getScrollTop as getInkScrollTop,
  useApp,
} from 'ink';
import {
  useMouse,
  useMouseContext,
  type MouseEvent,
} from '../../contexts/MouseContext.js';

import { debugLogger } from '@google/gemini-cli-core';

export const SCROLL_TO_ITEM_END = Number.MAX_SAFE_INTEGER;

export interface ClickableArea {
  id: string;
  box: { x: number; y: number; width: number; height: number };
}

export interface VirtualizedListContextValue {
  registerInteractivity: (
    itemKey: string,
    options: { scroll?: boolean; click?: boolean },
  ) => void;
  setItemState: (itemKey: string, stateKey: string, value: unknown) => void;
  getItemState: (itemKey: string, stateKey: string) => unknown;
  isItemToggled: (itemKey: string) => boolean;
  toggleItem: (itemKey: string) => void;
  registerClickCallback: (
    itemKey: string,
    areaId: string,
    callback: () => void,
  ) => void;
  unregisterClickCallback: (itemKey: string, areaId: string) => void;
  registerClickableArea: (el: DOMElement, areaId: string) => void;
  unregisterClickableArea: (el: DOMElement) => void;
}

export const VirtualizedListContext =
  createContext<VirtualizedListContextValue | null>(null);

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

function findOffsetIndexAtOrBefore(offsets: number[], target: number): number {
  let low = 0;
  let high = offsets.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const offset = offsets[mid] ?? 0;
    if (offset <= target) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return Math.min(result, Math.max(0, offsets.length - 2));
}

const isDOMElement = (node: unknown): node is DOMElement =>
  Boolean(
    node &&
      typeof node === 'object' &&
      'nodeName' in node &&
      (node as { nodeName?: unknown }).nodeName &&
      (node as { nodeName?: unknown }).nodeName !== '#text',
  );

const extractClickableAreas = (
  rootNode: DOMElement,
  clickableAreaMap: Map<DOMElement, string>,
): ClickableArea[] => {
  const rootBox = getBoundingBox(rootNode);
  const results: ClickableArea[] = [];

  const traverse = (current: DOMElement) => {
    const clickableId = clickableAreaMap.get(current);

    if (clickableId) {
      const childBox = getBoundingBox(current);

      results.push({
        id: clickableId,
        box: {
          x: (childBox.x ?? 0) - (rootBox.x ?? 0),
          y: (childBox.y ?? 0) - (rootBox.y ?? 0),
          width: childBox.width ?? 0,
          height: childBox.height ?? 0,
        },
      });
    }

    for (const child of current.childNodes || []) {
      if (isDOMElement(child)) {
        traverse(child);
      }
    }
  };

  traverse(rootNode);
  return results;
};

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
      <Box
        width="100%"
        flexDirection="column"
        flexShrink={0}
        ref={itemRef}
        // @ts-expect-error custom attribute for testing
        nodeType="item-root"
      >
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
    maxScrollbackLength: maxScrollbackLengthProp,
  } = props;

  const app = useApp();
  const maxScrollbackLength =
    maxScrollbackLengthProp ?? app.options.maxScrollbackLength ?? 1000;

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

  const interactiveKeys = useRef(
    new Map<string, { scroll?: boolean; click?: boolean }>(),
  );
  const itemStates = useRef(new Map<string, Map<string, unknown>>());
  const [toggledKeys, setToggledKeys] = useState(() => new Set<string>());
  const toggledKeysRef = useRef(toggledKeys);
  toggledKeysRef.current = toggledKeys;
  const [temporarilyInteractiveIndexes, setTemporarilyInteractiveIndexes] =
    useState(() => new Set<number>());
  const renderedAsStatic = useRef<boolean[]>([]);
  const maxRenderRangeEnd = useRef(0);
  const [pendingReplayEvent, setPendingReplayEvent] = useState<{
    index: number;
    event: MouseEvent;
  } | null>(null);

  const pendingReplayEventRef = useRef(pendingReplayEvent);
  pendingReplayEventRef.current = pendingReplayEvent;

  const itemClickableAreas = useRef<Map<string, ClickableArea[]>>(new Map());
  const clickableAreaMap = useRef<Map<DOMElement, string>>(new Map());
  const itemMetaMap = useRef(
    new WeakMap<DOMElement, { index: number; key: string }>(),
  );
  const clickCallbacks = useRef<Map<string, Map<string, () => void>>>(
    new Map(),
  );

  const { broadcast } = useMouseContext();
  const broadcastRef = useRef(broadcast);
  broadcastRef.current = broadcast;

  const virtualizedListContextValue = useMemo<VirtualizedListContextValue>(
    () => ({
      registerInteractivity: (itemKey, options) => {
        interactiveKeys.current.set(itemKey, options);
      },
      setItemState: (itemKey, stateKey, value) => {
        let stateMap = itemStates.current.get(itemKey);
        if (!stateMap) {
          stateMap = new Map();
          itemStates.current.set(itemKey, stateMap);
        }
        stateMap.set(stateKey, value);
      },
      getItemState: (itemKey, stateKey) =>
        itemStates.current.get(itemKey)?.get(stateKey),
      isItemToggled: (itemKey) => toggledKeys.has(itemKey),
      toggleItem: (itemKey) => {
        setToggledKeys((prev) => {
          const next = new Set(prev);
          if (next.has(itemKey)) {
            next.delete(itemKey);
          } else {
            next.add(itemKey);
          }
          return next;
        });
      },
      registerClickCallback: (itemKey, areaId, callback) => {
        let itemMap = clickCallbacks.current.get(itemKey);
        if (!itemMap) {
          itemMap = new Map();
          clickCallbacks.current.set(itemKey, itemMap);
        }
        itemMap.set(areaId, callback);
      },
      unregisterClickCallback: (itemKey, areaId) => {
        const itemMap = clickCallbacks.current.get(itemKey);
        if (itemMap) {
          itemMap.delete(areaId);
          if (itemMap.size === 0) {
            clickCallbacks.current.delete(itemKey);
          }
        }
      },
      registerClickableArea: (el, areaId) => {
        clickableAreaMap.current.set(el, areaId);
      },
      unregisterClickableArea: (el) => {
        clickableAreaMap.current.delete(el);
      },
      toggledKeys,
    }),
    [toggledKeys],
  );

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

  const onStaticRender = useCallback(
    (index: number, key: string, node: DOMElement) => {
      const height = Math.round(getBoundingBox(node).height ?? 0);
      if (
        state.current.measuredHeights[index] !== height ||
        state.current.measuredKeys[index] !== key
      ) {
        state.current.measuredHeights[index] = height;
        state.current.measuredKeys[index] = key;
        setMeasurementVersion((v) => v + 1);
      }

      if (itemClickableAreas.current.has(key)) {
        // If we already have areas for this item, don't re-extract.
        // This is especially important for static items because children might
        // have null dimensions in some environments (like tests) or might be
        // cleared from the DOM after caching.
        return;
      }

      const areas = extractClickableAreas(node, clickableAreaMap.current);
      if (areas.length > 0) {
        // In some test environments, dimensions might be null/0.
        // We only overwrite if we get valid dimensions or if we don't have areas yet.
        const hasValidDimensions = areas.some(
          (a) => a.box.width > 0 || a.box.height > 0,
        );
        if (hasValidDimensions || !itemClickableAreas.current.has(key)) {
          itemClickableAreas.current.set(key, areas);
        }
      }
    },
    [],
  );

  const itemsObserver = useMemo(
    () =>
      new ResizeObserver((entries) => {
        let changed = false;
        for (const entry of entries) {
          if (!isDOMElement(entry.target)) continue;
          const meta = itemMetaMap.current.get(entry.target);
          if (meta) {
            const { index, key } = meta;
            const height = Math.round(entry.contentRect.height);
            if (
              height >= 0 &&
              state.current.itemRefs[index] === entry.target &&
              (state.current.measuredHeights[index] !== height ||
                state.current.measuredKeys[index] !== key)
            ) {
              state.current.measuredHeights[index] = height;
              state.current.measuredKeys[index] = key;
              changed = true;
            }
            if (height > 0) {
              const areas = extractClickableAreas(
                entry.target,
                clickableAreaMap.current,
              );
              if (areas.length > 0) {
                itemClickableAreas.current.set(key, areas);

                const pending = pendingReplayEventRef.current;
                if (pending && pending.index === index) {
                  debugLogger.log(
                    `[Mouse] Replaying event index=${index} from observer`,
                  );
                  broadcastRef.current(pending.event);
                  setPendingReplayEvent(null);
                }
              } else {
                itemClickableAreas.current.delete(key);
              }
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
          itemMetaMap.current.delete(oldEl);
        }
      }

      state.current.itemRefs[index] = el;

      if (el) {
        itemMetaMap.current.set(el, { index, key: itemKey });

        if (!isStatic) {
          itemsObserver.observe(el);
        }

        // Try to extract clickable areas immediately if dimensions are already available
        const areas = extractClickableAreas(el, clickableAreaMap.current);
        if (areas.length > 0) {
          const hasValidDimensions = areas.some(
            (a) => a.box.width > 0 || a.box.height > 0,
          );
          if (hasValidDimensions) {
            itemClickableAreas.current.set(itemKey, areas);

            const pending = pendingReplayEventRef.current;
            if (pending && pending.index === index) {
              debugLogger.log(
                `[Mouse] Replaying event index=${index} immediately`,
              );
              broadcastRef.current(pending.event);
              setPendingReplayEvent(null);
            }
          }
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
        const rawIndex = findLastIndex(
          offsets,
          (offset) => offset <= scrollBottom,
        );
        if (rawIndex === -1) {
          return { index: 0, offset: 0, isBottom: true };
        }
        const index = Math.min(rawIndex, Math.max(0, offsets.length - 2));
        return {
          index,
          offset: scrollBottom - offsets[index],
          isBottom: true,
        };
      }

      const rawIndex = findLastIndex(offsets, (offset) => offset <= scrollTop);
      if (rawIndex === -1) {
        return { index: 0, offset: 0 };
      }
      const index = Math.min(rawIndex, Math.max(0, offsets.length - 2));

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

  const backbufferStartIndex = useMemo(() => {
    if (
      overflowToBackbuffer &&
      typeof maxScrollbackLength === 'number' &&
      maxScrollbackLength > 0
    ) {
      // Cull at measured item boundaries. If the target line falls inside a
      // tall item, keep that whole item so the backbuffer has no blank gap.
      const targetOffset = Math.max(0, actualScrollTop - maxScrollbackLength);
      return findOffsetIndexAtOrBefore(offsets, targetOffset);
    }
    return 0;
  }, [overflowToBackbuffer, maxScrollbackLength, actualScrollTop, offsets]);

  const culledHeight =
    overflowToBackbuffer && maxScrollbackLength > 0
      ? (offsets[backbufferStartIndex] ?? 0)
      : 0;

  const logicalScrollTop = isStickingToBottom
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

  useEffect(() => {
    setTemporarilyInteractiveIndexes((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set(prev);
      for (const index of prev) {
        if (index > endIndex) {
          next.delete(index);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [endIndex]);

  const renderRangeStart = useMemo(() => {
    if (overflowToBackbuffer) {
      if (typeof maxScrollbackLength === 'number' && maxScrollbackLength > 0) {
        return backbufferStartIndex;
      }
      return 0;
    }
    return startIndex;
  }, [
    overflowToBackbuffer,
    maxScrollbackLength,
    backbufferStartIndex,
    startIndex,
  ]);

  const topSpacerHeight = Math.max(0, offsets[renderRangeStart] - culledHeight);

  let renderRangeEnd = endIndex;
  if (maxRenderRangeEnd.current > endIndex) {
    let allStatic = true;
    const currentMax = Math.min(
      maxRenderRangeEnd.current,
      data.length > 0 ? data.length - 1 : 0,
    );
    for (let i = endIndex + 1; i <= currentMax; i++) {
      const item = data[i];
      if (!item) continue;
      const isStaticByDefault =
        renderStatic === true || isStaticItem?.(item, i) === true;
      if (!isStaticByDefault) {
        allStatic = false;
        break;
      }
    }
    if (allStatic) {
      renderRangeEnd = currentMax;
    }
  }
  maxRenderRangeEnd.current = renderRangeEnd;

  const bottomSpacerHeight = Math.max(
    0,
    totalHeight - (offsets[renderRangeEnd + 1] ?? totalHeight),
  );

  // Always evaluate shouldBeStatic, width, etc. if we have a known width from the prop.
  // If containerHeight or containerWidth is 0 we defer rendering unless a static render or defined width overrides.
  // Wait, if it's not static and no width we need to wait for measure.
  // BUT the initial render MUST render *something* with a width if width prop is provided to avoid layout shifts.
  // We MUST wait for containerHeight > 0 before rendering, especially if renderStatic is true.
  // If containerHeight is 0, we will misclassify items as isOutsideViewport and permanently print them to StaticRender!
  const itemCache = useRef(
    new Map<
      string,
      {
        item: T;
        element: React.ReactElement;
        shouldBeStatic: boolean;
        width: number | string | undefined;
        containerWidth: number;
        index: number;
        isToggled: boolean;
        renderItem: typeof renderItem;
      }
    >(),
  );

  const isReady =
    containerHeight > 0 || (width !== undefined && typeof width === 'number');

  const renderedItems = useMemo(() => {
    if (!isReady) {
      return [];
    }

    const items = [];
    for (let i = renderRangeStart; i <= renderRangeEnd; i++) {
      const item = data[i];
      if (item) {
        const isOutsideViewport = i < startIndex || i > endIndex;
        const isStaticByDefault =
          (renderStatic === true && isOutsideViewport) ||
          isStaticItem?.(item, i) === true;

        const isTemporarilyInteractive =
          temporarilyInteractiveIndexes.has(i) && i <= endIndex;
        const shouldBeStatic = isStaticByDefault && !isTemporarilyInteractive;
        renderedAsStatic.current[i] = shouldBeStatic;

        const key = keyExtractor(item, i);
        const cached = itemCache.current.get(key);

        const isToggled = toggledKeys.has(key);

        let contentElement: React.ReactElement;
        if (
          cached &&
          cached.item === item &&
          cached.shouldBeStatic === shouldBeStatic &&
          cached.width === width &&
          cached.containerWidth === containerWidth &&
          cached.index === i &&
          cached.isToggled === isToggled &&
          cached.renderItem === renderItem
        ) {
          contentElement = cached.element;
        } else {
          if (shouldBeStatic) {
            contentElement = (
              <StaticRender
                key={`${key}-static-${typeof width === 'number' ? width : containerWidth}`}
                width={typeof width === 'number' ? width : containerWidth}
                onRender={(node: DOMElement) => onStaticRender(i, key, node)}
              >
                {() => renderItem({ item, index: i })}
              </StaticRender>
            );
          } else {
            contentElement = (
              <VirtualizedListItem
                key={key}
                itemKey={key}
                content={renderItem({ item, index: i })}
                index={i}
                onSetRef={onSetRef}
              />
            );
          }
          itemCache.current.set(key, {
            item,
            element: contentElement,
            shouldBeStatic,
            width,
            containerWidth,
            index: i,
            isToggled,
            renderItem,
          });
        }

        items.push(contentElement);

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

    // Cleanup cache to avoid memory leaks
    if (
      itemCache.current.size >
      Math.max(100, (renderRangeEnd - renderRangeStart + 1) * 3)
    ) {
      const keysToKeep = new Set<string>();
      for (
        let i = Math.max(0, renderRangeStart - 50);
        i <= Math.min(data.length - 1, renderRangeEnd + 50);
        i++
      ) {
        const item = data[i];
        if (item) {
          keysToKeep.add(keyExtractor(item, i));
        }
      }
      for (const key of itemCache.current.keys()) {
        if (!keysToKeep.has(key)) {
          itemCache.current.delete(key);
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
    temporarilyInteractiveIndexes,
    onStaticRender,
    toggledKeys,
  ]);

  const { getScrollTop, setPendingScrollTop } =
    useBatchedScroll(logicalScrollTop);

  useLayoutEffect(() => {
    // This effect is now just for cases where items are already mounted but not yet replayed
    if (pendingReplayEvent) {
      const { index, event } = pendingReplayEvent;
      const key = keyExtractor(data[index], index);
      const areas = itemClickableAreas.current.get(key);
      if (areas && areas.length > 0) {
        debugLogger.log(`[Mouse] Replaying event index=${index} from effect`);
        broadcast(event);
        setPendingReplayEvent(null);
      }
    }
  }, [pendingReplayEvent, broadcast, data, keyExtractor]);

  const handleMouse = useCallback(
    (event: MouseEvent) => {
      if (!state.current.container) return;

      const isClick = event.name === 'left-press';
      const isScroll =
        event.name === 'scroll-up' || event.name === 'scroll-down';
      if (!isClick && !isScroll) return;

      const { x, y, width, height } = getBoundingBox(state.current.container);
      const mouseX = event.col - 1;
      const mouseY = event.row - 1;

      const relativeX = mouseX - x;
      const relativeY = mouseY - y;

      if (
        relativeX >= 0 &&
        relativeX < width &&
        relativeY >= 0 &&
        relativeY < height
      ) {
        // getScrollTop() might return MAX_SAFE_INTEGER if stuck to bottom.
        // We need the true rendered layout scroll top which ink exposes directly via getScrollTop.
        const trueScrollTop =
          getInkScrollTop(state.current.container) + culledHeight;
        const absoluteY = trueScrollTop + relativeY;

        const index = findLastIndex(offsets, (offset) => offset <= absoluteY);

        if (index !== -1) {
          const item = data[index];
          if (item) {
            const itemKey = keyExtractor(item, index);
            const options = interactiveKeys.current.get(itemKey);

            // Determine if the click was exactly on the first line of the item
            const itemStartY = offsets[index] ?? 0;
            const isFirstLineClick = isClick && absoluteY === itemStartY;

            // Hit-test against explicitly defined clickable areas inside the item
            if (isClick && itemClickableAreas.current.has(itemKey)) {
              const mouseRelativeY = absoluteY - itemStartY;
              const areas = itemClickableAreas.current.get(itemKey) ?? [];

              for (const area of areas) {
                if (
                  relativeX >= area.box.x &&
                  relativeX < area.box.x + area.box.width &&
                  mouseRelativeY >= area.box.y &&
                  mouseRelativeY < area.box.y + area.box.height
                ) {
                  debugLogger.log(
                    `[Mouse] Clicked inside tagged area: ${area.id} in itemKey: ${itemKey}`,
                  );

                  if (renderedAsStatic.current[index]) {
                    debugLogger.log(
                      `[Mouse] Waking up static item index=${index} due to click on area=${area.id}`,
                    );
                    setTemporarilyInteractiveIndexes((prev) => {
                      const next = new Set(prev);
                      next.add(index);
                      return next;
                    });
                    setPendingReplayEvent({ index, event });
                    return;
                  }

                  const callback = clickCallbacks.current
                    .get(itemKey)
                    ?.get(area.id);
                  if (callback) {
                    debugLogger.log(
                      `[Mouse] Dispatching click callback for area=${area.id} in itemKey=${itemKey}`,
                    );
                    callback();
                    return;
                  }

                  break;
                }
              }
            }

            debugLogger.log(
              `[Mouse] itemKey=${itemKey} options=${JSON.stringify(options)}`,
            );
            if (options) {
              if (isFirstLineClick && options.click) {
                if (renderedAsStatic.current[index]) {
                  debugLogger.log(
                    `[Mouse] Waking up static item index=${index} due to first-line click`,
                  );
                  setTemporarilyInteractiveIndexes((prev) => {
                    const next = new Set(prev);
                    next.add(index);
                    return next;
                  });
                  setPendingReplayEvent({ index, event });
                  return;
                }
                debugLogger.log(
                  `[Mouse] First line click detected. Toggling itemKey=${itemKey}.`,
                );
                virtualizedListContextValue.toggleItem(itemKey);
              } else if (
                renderedAsStatic.current[index] &&
                isScroll &&
                options.scroll
              ) {
                // Only wake up the item for scroll events
                setTemporarilyInteractiveIndexes((prev) => {
                  const next = new Set(prev);
                  next.add(index);
                  return next;
                });
                setPendingReplayEvent({ index, event });
              }
            }
          }
        }
      }
    },
    [offsets, data, keyExtractor, virtualizedListContextValue, culledHeight],
  );

  useMouse(handleMouse, { isActive: true });

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
        const effectiveTotalHeight = totalHeight - culledHeight;
        const maxScroll = Math.max(
          0,
          effectiveTotalHeight - scrollableContainerHeight,
        );
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
          const newScrollTop = Math.max(0, offset + culledHeight);
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
        const effectiveTotalHeight = totalHeight - culledHeight;
        const maxScroll = Math.max(
          0,
          effectiveTotalHeight - scrollableContainerHeight,
        );
        return {
          scrollTop: Math.min(
            Math.max(0, getScrollTop() - culledHeight),
            maxScroll,
          ),
          scrollHeight: effectiveTotalHeight,
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
      culledHeight,
    ],
  );

  return (
    <VirtualizedListContext.Provider value={virtualizedListContextValue}>
      <Box
        ref={containerRefCallback}
        overflowY="scroll"
        overflowX="hidden"
        scrollTop={
          isStickingToBottom
            ? Number.MAX_SAFE_INTEGER
            : Math.max(0, getScrollTop() - culledHeight)
        }
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
    </VirtualizedListContext.Provider>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const VirtualizedListWithForwardRef = forwardRef(VirtualizedList) as <T>(
  props: VirtualizedListProps<T> & { ref?: React.Ref<VirtualizedListRef<T>> },
) => React.ReactElement;

export { VirtualizedListWithForwardRef as VirtualizedList };

VirtualizedList.displayName = 'VirtualizedList';
