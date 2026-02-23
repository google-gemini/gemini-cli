/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, type DOMElement } from 'ink';
import { theme } from '../semantic-colors.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';

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
}) => {
  const isAlternateBuffer = useAlternateBuffer();

  return (
    <Box
      ref={containerRef}
      sticky
      minHeight={1}
      flexShrink={0}
      width={width}
      stickyChildren={
        <Box
          borderStyle={isAlternateBuffer ? undefined : 'round'}
          flexDirection="column"
          width={width}
          opaque
          borderColor={borderColor}
          borderDimColor={borderDimColor}
          borderBottom={false}
          borderTop={isAlternateBuffer ? false : isFirst}
          borderLeft={!isAlternateBuffer}
          borderRight={!isAlternateBuffer}
          paddingTop={isFirst ? 0 : 1}
        >
          <Box paddingX={1}>{children}</Box>
          {/* Dark border to separate header from content. */}
          <Box
            width={width - 2}
            borderColor={theme.ui.dark}
            borderStyle={isAlternateBuffer ? undefined : 'single'}
            borderTop={false}
            borderBottom={!isAlternateBuffer}
            borderLeft={false}
            borderRight={false}
          ></Box>
        </Box>
      }
    >
      <Box
        borderStyle={isAlternateBuffer ? undefined : 'round'}
        width={width}
        borderColor={borderColor}
        borderDimColor={borderDimColor}
        borderBottom={false}
        borderTop={isAlternateBuffer ? false : isFirst}
        borderLeft={!isAlternateBuffer}
        borderRight={!isAlternateBuffer}
        paddingX={1}
        paddingBottom={1}
        paddingTop={isFirst ? 0 : 1}
      >
        {children}
      </Box>
    </Box>
  );
};
