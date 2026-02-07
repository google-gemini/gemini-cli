/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { theme } from '../../semantic-colors.js';

interface HorizontalLineProps {
  width?: number;
  color?: string;
}

export const HorizontalLine: React.FC<HorizontalLineProps> = ({
  width,
  color = theme.border.default,
}) => {
  const { columns } = useTerminalSize();
  const resolvedWidth = Math.max(1, width ?? columns);

  return <Text color={color}>{'─'.repeat(resolvedWidth)}</Text>;
};
