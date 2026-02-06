/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useRef,
  useCallback,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Box, type DOMElement, ResizeObserver } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { useScrollable } from '../../contexts/ScrollProvider.js';
import { useAnimatedScrollbar } from '../../hooks/useAnimatedScrollbar.js';
import { useBatchedScroll } from '../../hooks/useBatchedScroll.js';

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

type ScrollState = {
  scrollTop: number;
  innerHeight: number;
  scrollHeight: number;
  lastMeasuredChildrenCount: number;
};

type ScrollAction =
  | { type: 'SET_INNER_HEIGHT'; height: number }
  | {
      type: 'SET_SCROLL_HEIGHT';
      height: number;
      scrollToBottom: boolean;
      currentChildrenCount: number;
    }
  | { type: 'SET_SCROLL_TOP'; top: number };

function scrollReducer(state: ScrollState, action: ScrollAction): ScrollState {
  switch (action.type) {
    case 'SET_INNER_HEIGHT': {
      if (state.innerHeight === action.height) {
        return state;
      }
      const isAtBottom =
        state.scrollTop >= state.scrollHeight - state.innerHeight - 1;
      let { scrollTop } = state;
      if (isAtBottom) {
        scrollTop = Math.max(0, state.scrollHeight - action.height);
      }
      return { ...state, innerHeight: action.height, scrollTop };
    }
    case 'SET_SCROLL_HEIGHT': {
      if (
        state.scrollHeight === action.height &&
        state.lastMeasuredChildrenCount === action.currentChildrenCount
      ) {
        return state;
      }
      const isAtBottom =
        state.scrollTop >= state.scrollHeight - state.innerHeight - 1;
      const childCountChanged =
        action.currentChildrenCount !== state.lastMeasuredChildrenCount;
      let { scrollTop } = state;
      if (isAtBottom || (action.scrollToBottom && childCountChanged)) {
        scrollTop = Math.max(0, action.height - state.innerHeight);
      }
      return {
        ...state,
        scrollHeight: action.height,
        scrollTop,
        lastMeasuredChildrenCount: action.currentChildrenCount,
      };
    }
    case 'SET_SCROLL_TOP':
      return { ...state, scrollTop: action.top };
    default:
      return state;
  }
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
  const [state, dispatch] = useReducer(scrollReducer, {
    scrollTop: 0,
    innerHeight: 0,
    scrollHeight: 0,
    lastMeasuredChildrenCount: React.Children.count(children),
  });

  const { scrollTop, innerHeight, scrollHeight } = state;

  const scrollTopRef = useRef(scrollTop);
  scrollTopRef.current = scrollTop;

  const [containerNode, setContainerNode] = useState<DOMElement | null>(null);
  const ref = useRef<DOMElement>(null);

  const sizeRef = useRef({ innerHeight, scrollHeight });
  sizeRef.current = { innerHeight, scrollHeight };

  const childrenCountRef = useRef(React.Children.count(children));
  childrenCountRef.current = React.Children.count(children);

  const containerObserverRef = useRef<ResizeObserver | null>(null);
  const setRef = useCallback((node: DOMElement | null) => {
    if (containerObserverRef.current) {
      containerObserverRef.current.disconnect();
      containerObserverRef.current = null;
    }
    (ref as React.MutableRefObject<DOMElement | null>).current = node;
    setContainerNode(node);
    if (node) {
      containerObserverRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const newInnerHeight = Math.round(entry.contentRect.height);
          dispatch({ type: 'SET_INNER_HEIGHT', height: newInnerHeight });
        }
      });
      containerObserverRef.current.observe(node);
    }
  }, []);

  const contentRef = useRef<DOMElement>(null);
  const contentObserverRef = useRef<ResizeObserver | null>(null);
  const setContentRef = useCallback(
    (node: DOMElement | null) => {
      if (contentObserverRef.current) {
        contentObserverRef.current.disconnect();
        contentObserverRef.current = null;
      }
      (contentRef as React.MutableRefObject<DOMElement | null>).current = node;
      if (node) {
        contentObserverRef.current = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            const newScrollHeight = Math.round(entry.contentRect.height);
            dispatch({
              type: 'SET_SCROLL_HEIGHT',
              height: newScrollHeight,
              scrollToBottom: !!scrollToBottom,
              currentChildrenCount: childrenCountRef.current,
            });
          }
        });
        contentObserverRef.current.observe(node);
      }
    },
    [scrollToBottom],
  );

  const { getScrollTop, setPendingScrollTop } = useBatchedScroll(scrollTop);

  const scrollBy = useCallback(
    (delta: number) => {
      const { scrollHeight, innerHeight } = sizeRef.current;
      const current = getScrollTop();
      const next = Math.min(
        Math.max(0, current + delta),
        Math.max(0, scrollHeight - innerHeight),
      );
      setPendingScrollTop(next);
      dispatch({ type: 'SET_SCROLL_TOP', top: next });
    },
    [getScrollTop, setPendingScrollTop],
  );

  const { scrollbarColor, flashScrollbar, scrollByWithAnimation } =
    useAnimatedScrollbar(hasFocus, scrollBy);

  useKeypress(
    (key: Key) => {
      if (key.shift) {
        if (key.name === 'up') {
          scrollByWithAnimation(-1);
        }
        if (key.name === 'down') {
          scrollByWithAnimation(1);
        }
      }
    },
    { isActive: hasFocus },
  );

  const getScrollState = useCallback(
    () => ({
      scrollTop: getScrollTop(),
      scrollHeight: state.scrollHeight,
      innerHeight: state.innerHeight,
    }),
    [getScrollTop, state.scrollHeight, state.innerHeight],
  );

  const hasFocusCallback = useCallback(() => hasFocus, [hasFocus]);

  const scrollableEntry = useMemo(
    () => ({
      ref: ref as React.RefObject<DOMElement>,
      getScrollState,
      scrollBy: scrollByWithAnimation,
      hasFocus: hasFocusCallback,
      flashScrollbar,
    }),
    [getScrollState, scrollByWithAnimation, hasFocusCallback, flashScrollbar],
  );

  useScrollable(scrollableEntry, hasFocus && containerNode !== null);

  return (
    <Box
      ref={setRef}
      maxHeight={maxHeight}
      width={width ?? maxWidth}
      height={height}
      flexDirection="column"
      overflowY="scroll"
      overflowX="hidden"
      scrollTop={scrollTop}
      flexGrow={flexGrow}
      scrollbarThumbColor={scrollbarColor}
    >
      {/*
        This inner box is necessary to prevent the parent from shrinking
        based on the children's content. It also adds a right padding to
        make room for the scrollbar.
      */}
      <Box
        ref={setContentRef}
        flexShrink={0}
        paddingRight={1}
        flexDirection="column"
      >
        {children}
      </Box>
    </Box>
  );
};
