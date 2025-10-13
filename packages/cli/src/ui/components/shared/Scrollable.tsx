/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type React from 'react';
import { Box } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { useMouse, type MouseEvent } from '../../hooks/useMouse.js';
import { theme } from '../../semantic-colors.js';

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
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (scrollToBottom) {
      setScrollTop(Number.MAX_SAFE_INTEGER);
    }
  }, [scrollToBottom, children]);

  useKeypress(
    (key: Key) => {
      if (key.name === 'mouse-scroll-up') {
        setScrollTop((prev: number) => Math.max(0, prev - 1));
      } else if (key.name === 'mouse-scroll-down') {
        setScrollTop((prev: number) => prev + 1);
      } else if (key.shift) {
        if (key.name === 'up') {
          setScrollTop((prev: number) => Math.max(0, prev - 1));
        }
        if (key.name === 'down') {
          // Ink's <Box> will clamp the value so we don't need to know the max.
          setScrollTop((prev: number) => prev + 1);
        }
      }
    },
    { isActive: hasFocus },
  );

  useMouse(
    (event: MouseEvent) => {
      if (event.name === 'wheel') {
        if (event.wheelDirection === 'up') {
          setScrollTop((prev: number) => Math.max(0, prev - 1));
        } else if (event.wheelDirection === 'down') {
          setScrollTop((prev: number) => prev + 1);
        }
      }
    },
    { isActive: hasFocus },
  );

  return (
    <Box
      maxHeight={maxHeight}
      width={width ?? maxWidth}
      height={height}
      flexDirection="column"
      overflowY="scroll"
      overflowX="hidden"
      scrollTop={scrollTop}
      flexGrow={flexGrow}
      scrollbarThumbColor={theme.text.secondary}
    >
      {/*
        This inner box is necessary to prevent the parent from shrinking
        based on the children's content. It also adds a right padding to
        make room for the scrollbar.
      */}
      <Box flexShrink={0} paddingRight={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
};
