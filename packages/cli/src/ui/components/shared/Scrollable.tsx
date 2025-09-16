/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import type React from 'react';
import { Box, useInput } from 'ink';

interface ScrollableProps {
  children?: React.ReactNode;
  maxWidth?: number;
  maxHeight: number;
  hasFocus: boolean;
}

export const Scrollable: React.FC<ScrollableProps> = ({
  children,
  maxWidth,
  maxHeight,
  hasFocus,
}) => {
  const [scrollTop, setScrollTop] = useState(0);

  useInput(
    (_input, key) => {
      if (key.shift) {
        if (key.upArrow && key.shift) {
          setScrollTop((prev: number) => Math.max(0, prev - 1));
        }
        if (key.downArrow && key.shift) {
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
      width={maxWidth}
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
