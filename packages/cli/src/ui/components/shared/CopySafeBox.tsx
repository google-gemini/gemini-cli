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

    // When in copy mode, we remove borders and add compensatory padding (2)
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
        paddingLeft={2}
        paddingRight={2}
      >
        {children}
      </Box>
    );
  },
);

CopySafeBox.displayName = 'CopySafeBox';
