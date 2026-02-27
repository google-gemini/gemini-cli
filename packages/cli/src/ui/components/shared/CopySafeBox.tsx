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

/**
 * A Box that removes borders and adds compensatory padding in alternate buffer
 * copy mode. This ensures that the layout remains consistent for selection
 * while making it easier to copy text without horizontal borders.
 */
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
      padding: _padding,
      paddingX: _paddingX,
      paddingY: _paddingY,
      paddingLeft: _paddingLeft,
      paddingRight: _paddingRight,
      paddingTop: _paddingTop,
      paddingBottom: _paddingBottom,
      ...rest
    } = props;

    // Calculate compensatory padding.
    // If borderStyle is set, it means all 4 sides have borders unless explicitly disabled.
    const hasBorderStyle = _borderStyle !== undefined;
    const effectiveLeftBorder =
      _borderLeft === true || (hasBorderStyle && _borderLeft !== false);
    const effectiveRightBorder =
      _borderRight === true || (hasBorderStyle && _borderRight !== false);
    const effectiveTopBorder =
      _borderTop === true || (hasBorderStyle && _borderTop !== false);
    const effectiveBottomBorder =
      _borderBottom === true || (hasBorderStyle && _borderBottom !== false);

    const pL = Number(_paddingLeft ?? _paddingX ?? _padding ?? 0);
    const pR = Number(_paddingRight ?? _paddingX ?? _padding ?? 0);
    const pT = Number(_paddingTop ?? _paddingY ?? _padding ?? 0);
    const pB = Number(_paddingBottom ?? _paddingY ?? _padding ?? 0);

    const finalPaddingLeft = (effectiveLeftBorder ? 1 : 0) + pL;
    const finalPaddingRight = (effectiveRightBorder ? 1 : 0) + pR;
    const finalPaddingTop = (effectiveTopBorder ? 1 : 0) + pT;
    const finalPaddingBottom = (effectiveBottomBorder ? 1 : 0) + pB;

    return (
      <Box
        {...rest}
        ref={ref}
        borderStyle={undefined}
        borderTop={false}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        paddingLeft={finalPaddingLeft}
        paddingRight={finalPaddingRight}
        paddingTop={finalPaddingTop}
        paddingBottom={finalPaddingBottom}
      >
        {children}
      </Box>
    );
  },
);

CopySafeBox.displayName = 'CopySafeBox';
