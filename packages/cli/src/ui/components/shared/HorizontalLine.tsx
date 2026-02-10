/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { theme } from '../../semantic-colors.js';

export type LinePosition = 'top' | 'center' | 'bottom';

interface HorizontalLineProps {
  color?: string;
  width?: number | string;
  position?: LinePosition;
}

const overlineStyle = {
  top: '‾',
  bottom: '',
  left: '',
  right: '',
  topLeft: '',
  topRight: '',
  bottomLeft: '',
  bottomRight: '',
};

const underlineStyle = {
  top: '_',
  bottom: '',
  left: '',
  right: '',
  topLeft: '',
  topRight: '',
  bottomLeft: '',
  bottomRight: '',
};

export const HorizontalLine: React.FC<HorizontalLineProps> = ({
  color = theme.border.default,
  width = '100%',
  position = 'center',
}) => {
  const borderStyle =
    position === 'top'
      ? overlineStyle
      : position === 'bottom'
        ? underlineStyle
        : 'single';

  return (
    <Box
      width={width}
      borderStyle={borderStyle}
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor={color}
    />
  );
};
