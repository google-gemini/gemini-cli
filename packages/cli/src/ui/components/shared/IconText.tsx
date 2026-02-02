/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { shouldUseEmoji } from '../../utils/terminalUtils.js';

interface IconTextProps {
  icon: string;
  fallbackIcon?: string;
  text: string;
  color?: string;
  bold?: boolean;
}

export const IconText: React.FC<IconTextProps> = ({
  icon,
  fallbackIcon,
  text,
  color,
  bold,
}) => {
  const resolvedIcon = shouldUseEmoji() ? icon : (fallbackIcon ?? icon);
  return (
    <Text color={color} bold={bold}>
      {resolvedIcon} {text}
    </Text>
  );
};
