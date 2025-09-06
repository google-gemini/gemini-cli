/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { theme as semanticTheme } from '../semantic-colors.js';
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

  return (
    <Box
      alignItems="flex-start"
      width={artWidth}
      flexShrink={0}
      flexDirection="column"
    >
      {semanticTheme.ui.gradient ? (
        <Gradient colors={semanticTheme.ui.gradient}>
          <Text>{displayTitle}</Text>
        </Gradient>
      ) : (
        <Text color={semanticTheme.text.primary}>{displayTitle}</Text>
      )}
      {nightly && (
        <Box width="100%" flexDirection="row" justifyContent="flex-end">
          {semanticTheme.ui.gradient ? (
            <Gradient colors={semanticTheme.ui.gradient}>
              <Text>v{version}</Text>
            </Gradient>
          ) : (
            <Text color={semanticTheme.text.primary}>v{version}</Text>
          )}
        </Box>
      )}
    </Box>
  );
};
