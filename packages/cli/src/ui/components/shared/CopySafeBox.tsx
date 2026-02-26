/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { forwardRef, type ReactNode } from 'react';
import { Box, type BoxProps, type DOMElement } from 'ink';
import { useUIState } from '../../contexts/UIStateContext.js';

export interface CopySafeBoxProps extends BoxProps {
  children?: ReactNode;
}

export const CopySafeBox = forwardRef<DOMElement, CopySafeBoxProps>(
  (props, ref) => {
    const { copyModeEnabled } = useUIState();

    if (!copyModeEnabled) {
      const { children, ...rest } = props;
      return (
        <Box {...rest} ref={ref}>
          {children}
        </Box>
      );
    }

    const {
      children,
      borderStyle: _borderStyle,
      borderTop: _borderTop,
      borderBottom: _borderBottom,
      borderLeft: _borderLeft,
      borderRight: _borderRight,
      paddingX: _paddingX,
      paddingLeft: _paddingLeft,
      paddingRight: _paddingRight,
      ...rest
    } = props;

    const hasBorderLeft = _borderLeft !== false && _borderStyle !== undefined;
    const hasBorderRight = _borderRight !== false && _borderStyle !== undefined;
    const borderLeftWidth = hasBorderLeft ? 1 : 0;
    const borderRightWidth = hasBorderRight ? 1 : 0;

    const originalPaddingLeft = Number(
      _paddingLeft ?? _paddingX ?? props.padding ?? 0,
    );
    const originalPaddingRight = Number(
      _paddingRight ?? _paddingX ?? props.padding ?? 0,
    );

    const newPaddingLeft = borderLeftWidth + originalPaddingLeft;
    const newPaddingRight = borderRightWidth + originalPaddingRight;

    // When in copy mode, we remove borders and add compensatory padding
    // to maintain the layout of the content relative to the terminal edge.
    return (
      <Box
        {...rest}
        ref={ref}
        borderStyle={undefined}
        borderTop={false}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        paddingLeft={newPaddingLeft}
        paddingRight={newPaddingRight}
      >
        {children}
      </Box>
    );
  },
);

CopySafeBox.displayName = 'CopySafeBox';
