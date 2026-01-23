/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import { useUIState } from '../../contexts/UIStateContext.js';
import { interpolateColor, resolveColor } from '../../themes/color-utils.js';
import { isLowColorDepth } from '../../utils/terminalUtils.js';

export interface HalfLinePaddedBoxProps {
  /**
   * The base color to blend with the terminal background.
   */
  backgroundBaseColor: string;

  /**
   * The opacity (0-1) for blending the backgroundBaseColor onto the terminal background.
   */
  backgroundOpacity: number;

  /**
   * Whether to render the solid background color.
   */
  useBackgroundColor?: boolean;

  children: React.ReactNode;
}

/**
 * A container component that renders a solid background with half-line padding
 * at the top and bottom using block characters (▀/▄).
 */
export const HalfLinePaddedBox: React.FC<HalfLinePaddedBoxProps> = ({
  backgroundBaseColor,
  backgroundOpacity,
  useBackgroundColor = true,
  children,
}) => {
  const { terminalWidth, terminalBackgroundColor } = useUIState();
  const terminalBg = terminalBackgroundColor || 'black';

  const isLowColor = isLowColorDepth();

  const backgroundColor = useMemo(() => {
    if (!useBackgroundColor) {
      return undefined;
    }

    // Interpolated background colors often look bad in 256-color terminals
    if (isLowColor) {
      const resolvedTerminalBg = resolveColor(terminalBg) || terminalBg;
      if (
        resolvedTerminalBg === 'black' ||
        resolvedTerminalBg === '#000000' ||
        resolvedTerminalBg === '#000'
      ) {
        return '#1c1c1c';
      }
      if (
        resolvedTerminalBg === 'white' ||
        resolvedTerminalBg === '#ffffff' ||
        resolvedTerminalBg === '#fff'
      ) {
        return '#eeeeee';
      }
      return undefined;
    }

    const resolvedBase =
      resolveColor(backgroundBaseColor) || backgroundBaseColor;
    const resolvedTerminalBg = resolveColor(terminalBg) || terminalBg;

    return interpolateColor(
      resolvedTerminalBg,
      resolvedBase,
      backgroundOpacity,
    );
  }, [
    useBackgroundColor,
    backgroundBaseColor,
    backgroundOpacity,
    terminalBg,
    isLowColor,
  ]);

  if (!backgroundColor) {
    return <>{children}</>;
  }

  return (
    <Box
      width={terminalWidth}
      flexDirection="column"
      alignItems="stretch"
      minHeight={1}
      flexShrink={0}
      backgroundColor={backgroundColor}
    >
      <Box width={terminalWidth} flexDirection="row">
        <Text backgroundColor={backgroundColor} color={terminalBg}>
          {'▀'.repeat(terminalWidth)}
        </Text>
      </Box>
      {children}
      <Box width={terminalWidth} flexDirection="row">
        <Text color={terminalBg} backgroundColor={backgroundColor}>
          {'▄'.repeat(terminalWidth)}
        </Text>
      </Box>
    </Box>
  );
};
