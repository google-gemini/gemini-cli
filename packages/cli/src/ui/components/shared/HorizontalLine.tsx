/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { theme } from '../../semantic-colors.js';

interface HorizontalLineProps {
  color?: string;
}

export const HorizontalLine: React.FC<HorizontalLineProps> = ({
  color = theme.border.default,
}) => (
  <Box
    width="100%"
    borderStyle="single"
    borderTop
    borderBottom={false}
    borderLeft={false}
    borderRight={false}
    borderColor={color}
  />
);
