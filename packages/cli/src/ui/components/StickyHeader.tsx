/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, type DOMElement } from 'ink';
import { theme } from '../semantic-colors.js';

export interface StickyHeaderProps {
  children: React.ReactNode;
  width: number;
  isFirst: boolean;
  borderColor: string;
  borderDimColor: boolean;
  containerRef?: React.RefObject<DOMElement | null>;
}

export const StickyHeader: React.FC<StickyHeaderProps> = ({
  children,
  width,
  isFirst,
  borderColor,
  borderDimColor,
  containerRef,
}) => (
  <Box
    ref={containerRef}
    sticky
    minHeight={1}
    flexShrink={0}
    width={width}
    stickyChildren={
      <Box
        borderStyle="round"
        flexDirection="column"
        width={width}
        opaque
        borderColor={borderColor}
        borderDimColor={borderDimColor}
        borderBottom={false}
        borderTop={isFirst}
        paddingTop={isFirst ? 0 : 1}
      >
        <Box paddingX={1}>{children}</Box>
        {/* Dark border to separate header from content. */}
        <Box
          width={width - 2}
          borderColor={theme.ui.dark}
          borderStyle="single"
          borderTop={false}
          borderBottom={true}
          borderLeft={false}
          borderRight={false}
        ></Box>
      </Box>
    }
  >
    <Box
      borderStyle="round"
      width={width}
      borderColor={borderColor}
      borderDimColor={borderDimColor}
      borderBottom={false}
      borderTop={isFirst}
      borderLeft={true}
      borderRight={true}
      paddingX={1}
      paddingBottom={1}
      paddingTop={isFirst ? 0 : 1}
    >
      {children}
    </Box>
  </Box>
);
