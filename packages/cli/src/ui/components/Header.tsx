/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { theme } from '../semantic-colors.js';
import { shortAsciiLogo, longAsciiLogo, tinyAsciiLogo } from './AsciiArt.js';
import { getAsciiArtWidth } from '../utils/textUtils.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

interface HeaderProps {
  customAsciiArt?: string; // For user-defined ASCII art
  version: string;
  nightly: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  customAsciiArt,
  version,
  nightly,
}) => {
  const { columns: terminalWidth } = useTerminalSize();
  let displayTitle;
  const widthOfLongLogo = getAsciiArtWidth(longAsciiLogo);
  const widthOfShortLogo = getAsciiArtWidth(shortAsciiLogo);

  if (customAsciiArt) {
    displayTitle = customAsciiArt;
  } else if (terminalWidth >= widthOfLongLogo) {
    displayTitle = longAsciiLogo;
  } else if (terminalWidth >= widthOfShortLogo) {
    displayTitle = shortAsciiLogo;
  } else {
    displayTitle = tinyAsciiLogo;
  }

  const artWidth = getAsciiArtWidth(displayTitle);

  // Theming is not always reliable, and can return an array with a single
  // (or no) color stops. The gradient library requires at least two, so this
  // logic checks for that and provides a fallback.
  const PALETTE = ['#4285F4', '#34A853', '#FBBC05', '#EA4335'];
  const gradient =
    theme.ui.gradient && theme.ui.gradient.length >= 2
      ? theme.ui.gradient
      : PALETTE;

  return (
    <Box
      alignItems="flex-start"
      width={artWidth}
      flexShrink={0}
      flexDirection="column"
    >
      <Gradient colors={gradient}>
        <Text>{displayTitle}</Text>
      </Gradient>
      {nightly && (
        <Box width="100%" flexDirection="row" justifyContent="flex-end">
          <Gradient colors={gradient}>
            <Text>v{version}</Text>
          </Gradient>
        </Box>
      )}
    </Box>
  );
};
