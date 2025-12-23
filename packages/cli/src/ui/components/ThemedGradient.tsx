/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, type TextProps } from 'ink';
import Gradient from 'ink-gradient';
import { theme } from '../semantic-colors.js';

interface ThemedGradientProps extends TextProps {
  colors?: string[];
}

export const ThemedGradient: React.FC<ThemedGradientProps> = ({
  children,
  colors,
  ...props
}) => {
  const gradient = colors || theme.ui.gradient;

  if (gradient && gradient.length >= 2) {
    return (
      <Gradient colors={gradient}>
        <Text {...props}>{children}</Text>
      </Gradient>
    );
  }

  if (gradient && gradient.length === 1) {
    return (
      <Text color={gradient[0]} {...props}>
        {children}
      </Text>
    );
  }

  // Fallback to accent color if no gradient
  return (
    <Text color={theme.text.accent} {...props}>
      {children}
    </Text>
  );
};
