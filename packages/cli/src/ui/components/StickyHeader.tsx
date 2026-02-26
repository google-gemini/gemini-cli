/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, type DOMElement } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { CopySafeBox } from './shared/CopySafeBox.js';

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
  const { copyModeEnabled } = useUIState();

  const commonProps = {
    borderStyle: 'round' as const,
    flexDirection: 'column' as const,
    width,
    borderColor,
    borderDimColor,
    borderBottom: false,
    borderTop: isFirst,
    paddingTop: isFirst ? 0 : 1,
  };

  return (
    <Box
      ref={containerRef}
      sticky
      minHeight={1}
      flexShrink={0}
      width={width}
      stickyChildren={
        <CopySafeBox {...commonProps} opaque>
          <Box paddingX={1}>{children}</Box>
          {/* Dark border to separate header from content. */}
          {!copyModeEnabled && (
            <Box
              width={width - 2}
              borderColor={theme.ui.dark}
              borderStyle="single"
              borderTop={false}
              borderBottom={true}
              borderLeft={false}
              borderRight={false}
            ></Box>
          )}
        </CopySafeBox>
      }
    >
      <CopySafeBox
        {...commonProps}
        borderLeft={true}
        borderRight={true}
        paddingBottom={copyModeEnabled ? 0 : 1}
      >
        <Box paddingX={1}>{children}</Box>
      </CopySafeBox>
    </Box>
  );
};
