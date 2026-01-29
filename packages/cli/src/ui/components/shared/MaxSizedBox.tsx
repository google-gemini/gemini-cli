/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Box, Text, ResizeObserver, type DOMElement } from 'ink';
import { theme } from '../../semantic-colors.js';
import { useOverflowActions } from '../../contexts/OverflowContext.js';

/**
 * Minimum height for the MaxSizedBox component.
 * This ensures there is room for at least one line of content as well as the
 * message that content was truncated.
 */
export const MINIMUM_MAX_HEIGHT = 2;

interface MaxSizedBoxProps {
  children?: React.ReactNode;
  maxWidth?: number;
  maxHeight?: number;
  overflowDirection?: 'top' | 'bottom';
  additionalHiddenLinesCount?: number;
}

/**
 * A React component that constrains the size of its children and provides
 * content-aware truncation when the content exceeds the specified `maxHeight`.
 */
export const MaxSizedBox: React.FC<MaxSizedBoxProps> = ({
  children,
  maxWidth,
  maxHeight,
  overflowDirection = 'top',
  additionalHiddenLinesCount = 0,
}) => {
  const id = useId();
  const { addOverflowingId, removeOverflowingId } = useOverflowActions() || {};
  const observerRef = useRef<ResizeObserver | null>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const onRefChange = useCallback(
    (node: DOMElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (node && maxHeight !== undefined) {
        const observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            setContentHeight(entry.contentRect.height);
          }
        });
        observer.observe(node);
        observerRef.current = observer;
      }
    },
    [maxHeight],
  );

  const effectiveMaxHeight =
    maxHeight !== undefined
      ? Math.max(Math.round(maxHeight), MINIMUM_MAX_HEIGHT)
      : undefined;

  const isOverflowing =
    (effectiveMaxHeight !== undefined && contentHeight > effectiveMaxHeight) ||
    additionalHiddenLinesCount > 0;

  // If we're overflowing, we need to hide at least 1 line for the message.
  const visibleContentHeight =
    isOverflowing && effectiveMaxHeight !== undefined
      ? effectiveMaxHeight - 1
      : effectiveMaxHeight;

  const hiddenLinesCount =
    visibleContentHeight !== undefined
      ? Math.max(0, contentHeight - visibleContentHeight)
      : 0;

  const totalHiddenLines = hiddenLinesCount + additionalHiddenLinesCount;

  useEffect(() => {
    if (totalHiddenLines > 0) {
      addOverflowingId?.(id);
    } else {
      removeOverflowingId?.(id);
    }

    return () => {
      removeOverflowingId?.(id);
    };
  }, [id, totalHiddenLines, addOverflowingId, removeOverflowingId]);

  if (effectiveMaxHeight === undefined) {
    return (
      <Box flexDirection="column" width={maxWidth}>
        {children}
      </Box>
    );
  }

  const offset =
    hiddenLinesCount > 0 && overflowDirection === 'top' ? -hiddenLinesCount : 0;

  return (
    <Box
      flexDirection="column"
      width={maxWidth}
      maxHeight={effectiveMaxHeight}
      flexShrink={0}
    >
      {totalHiddenLines > 0 && overflowDirection === 'top' && (
        <Text color={theme.text.secondary} wrap="truncate">
          ... first {totalHiddenLines} line{totalHiddenLines === 1 ? '' : 's'}{' '}
          hidden ...
        </Text>
      )}
      <Box flexDirection="column" overflow="hidden" flexGrow={1}>
        <Box
          flexDirection="column"
          ref={onRefChange}
          flexShrink={0}
          marginTop={offset}
        >
          {children}
        </Box>
      </Box>
      {totalHiddenLines > 0 && overflowDirection === 'bottom' && (
        <Text color={theme.text.secondary} wrap="truncate">
          ... last {totalHiddenLines} line{totalHiddenLines === 1 ? '' : 's'}{' '}
          hidden ...
        </Text>
      )}
    </Box>
  );
};
