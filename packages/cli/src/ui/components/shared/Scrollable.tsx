/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type React from 'react';
import { Box } from 'ink';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';

interface ScrollableProps {
  children?: React.ReactNode;
  width?: number;
  maxWidth?: number;
  maxHeight?: number;
  hasFocus: boolean;
  scrollToBottom?: boolean;
}

export const Scrollable: React.FC<ScrollableProps> = ({
  children,
  width,
  maxWidth,
  maxHeight,
  hasFocus,
  scrollToBottom,
}) => {
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (scrollToBottom) {
      setScrollTop(Number.MAX_SAFE_INTEGER);
    }
  }, [scrollToBottom, children]);

  useKeypress(
    (key: Key) => {
      if (key.shift) {
        if (key.name === 'up' && key.shift) {
          setScrollTop((prev: number) => Math.max(0, prev - 1));
        }
        if (key.name === 'down' && key.shift) {
          // Ink's <Box> will clamp the value so we don't need to know the max.
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
      flexDirection="column"
      overflowY="scroll"
      overflowX="hidden"
      scrollTop={scrollTop}
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
