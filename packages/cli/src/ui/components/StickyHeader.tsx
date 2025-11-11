/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { theme } from '../semantic-colors.js';

export interface StickyHeaderProps {
  children: React.ReactNode;
  width: number;
}

export const StickyHeader: React.FC<StickyHeaderProps> = ({
  children,
  width,
}) => (
  <Box
    sticky
    minHeight={1}
    flexShrink={0}
    width={width}
    stickyChildren={
      <Box
        borderStyle="single"
        width={width}
        opaque
        borderColor={theme.ui.dark}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
      >
        {children}
      </Box>
    }
  >
    <Box paddingX={1} width={width}>
      {children}
    </Box>
  </Box>
);
