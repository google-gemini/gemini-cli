/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, type BoxProps } from 'ink';
import { useUIState } from '../../contexts/UIStateContext.js';

export const CopySafeBox: React.FC<BoxProps> = (props) => {
  const { copyModeEnabled } = useUIState();

  if (!copyModeEnabled) {
    return <Box {...props} />;
  }

  const {
    borderStyle: _borderStyle,
    borderTop: _borderTop,
    borderBottom: _borderBottom,
    borderLeft: _borderLeft,
    borderRight: _borderRight,
    padding: _padding,
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
      borderStyle={undefined}
      borderTop={false}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingLeft={2}
      paddingRight={2}
    />
  );
};
