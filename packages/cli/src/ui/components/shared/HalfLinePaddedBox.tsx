/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import { useUIState } from '../../contexts/UIStateContext.js';
import { theme } from '../../semantic-colors.js';
import {
  interpolateColor,
  resolveColor,
  getSafeLowColorBackground,
} from '../../themes/color-utils.js';
import { isLowColorDepth, isITerm2 } from '../../utils/terminalUtils.js';

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
export const HalfLinePaddedBox: React.FC<HalfLinePaddedBoxProps> = (props) => {
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  if (props.useBackgroundColor === false || isScreenReaderEnabled) {
    return <>{props.children}</>;
  }

  return <HalfLinePaddedBoxInternal {...props} />;
};

const HalfLinePaddedBoxInternal: React.FC<HalfLinePaddedBoxProps> = ({
  backgroundBaseColor,
  backgroundOpacity,
  children,
}) => {
  const { terminalWidth } = useUIState();
  const terminalBg = theme.background.primary || 'black';

  const isLowColor = isLowColorDepth();

  const backgroundColor = useMemo(() => {
    // Interpolated background colors often look bad in 256-color terminals
    if (isLowColor) {
      return getSafeLowColorBackground(terminalBg);
    }

    const resolvedBase =
      resolveColor(backgroundBaseColor) || backgroundBaseColor;
    const resolvedTerminalBg = resolveColor(terminalBg) || terminalBg;

    return interpolateColor(
      resolvedTerminalBg,
      resolvedBase,
      backgroundOpacity,
    );
  }, [backgroundBaseColor, backgroundOpacity, terminalBg, isLowColor]);

  if (!backgroundColor) {
    return <>{children}</>;
  }

  const isITerm = isITerm2();

  if (isITerm) {
    return (
      <Box
        width={terminalWidth}
        flexDirection="column"
        alignItems="stretch"
        minHeight={1}
        flexShrink={0}
      >
        <Box width={terminalWidth} flexDirection="row">
          <Text color={backgroundColor}>{'▄'.repeat(terminalWidth)}</Text>
        </Box>
        <Box
          width={terminalWidth}
          flexDirection="column"
          alignItems="stretch"
          backgroundColor={backgroundColor}
        >
          {children}
        </Box>
        <Box width={terminalWidth} flexDirection="row">
          <Text color={backgroundColor}>{'▀'.repeat(terminalWidth)}</Text>
        </Box>
      </Box>
    );
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
