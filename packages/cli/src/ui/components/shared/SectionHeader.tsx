/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import stringWidth from 'string-width';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { theme } from '../../semantic-colors.js';

const buildHeaderLine = (title: string, width: number) => {
  const prefix = `== ${title} `;
  const prefixWidth = stringWidth(prefix);
  if (width <= prefixWidth) {
    return prefix.slice(0, Math.max(0, width));
  }
  return prefix + '='.repeat(Math.max(0, width - prefixWidth));
};

export const SectionHeader: React.FC<{ title: string; width?: number }> = ({
  title,
  width,
}) => {
  const { columns: terminalWidth } = useTerminalSize();
  const resolvedWidth = Math.max(10, width ?? terminalWidth);
  const text = buildHeaderLine(title, resolvedWidth);

  return <Text color={theme.text.secondary}>{text}</Text>;
};
