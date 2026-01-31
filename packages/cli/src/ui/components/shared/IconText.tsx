/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import process from 'node:process';

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

function shouldUseEmoji(): boolean {
  const locale = (
    process.env['LC_ALL'] ||
    process.env['LC_CTYPE'] ||
    process.env['LANG'] ||
    ''
  ).toLowerCase();
  const supportsUtf8 = locale.includes('utf-8') || locale.includes('utf8');
  if (!supportsUtf8) {
    return false;
  }

  if (process.env['TERM'] === 'linux') {
    return false;
  }

  return true;
}
