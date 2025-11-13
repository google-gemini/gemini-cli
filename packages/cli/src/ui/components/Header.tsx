/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { theme } from '../semantic-colors.js';
import {
  shortAsciiLogo,
  longAsciiLogo,
  tinyAsciiLogo,
  shortAsciiLogoIde,
  longAsciiLogoIde,
  tinyAsciiLogoIde,
} from './AsciiArt.js';
import { getAsciiArtWidth } from '../utils/textUtils.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { getTerminalProgram } from '../utils/terminalSetup.js';

interface HeaderProps {
  customAsciiArt?: string; // For user-defined ASCII art
  version: string;
  nightly: boolean;
}

const ThemedGradient: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const gradient = theme.ui.gradient;

  if (gradient && gradient.length >= 2) {
    return (
      <Gradient colors={gradient}>
        <Text>{children}</Text>
      </Gradient>
    );
  }

  if (gradient && gradient.length === 1) {
    return <Text color={gradient[0]}>{children}</Text>;
  }

  return <Text>{children}</Text>;
};

export const Header: React.FC<HeaderProps> = ({
  customAsciiArt,
  version,
  nightly,
}) => {
  const { columns: terminalWidth } = useTerminalSize();
  const isIde = getTerminalProgram();
  let displayTitle;
  const widthOfLongLogo = getAsciiArtWidth(longAsciiLogo);
  const widthOfShortLogo = getAsciiArtWidth(shortAsciiLogo);

  if (customAsciiArt) {
    displayTitle = customAsciiArt;
  } else if (terminalWidth >= widthOfLongLogo) {
    displayTitle = isIde ? longAsciiLogoIde : longAsciiLogo;
  } else if (terminalWidth >= widthOfShortLogo) {
    displayTitle = isIde ? shortAsciiLogoIde : shortAsciiLogo;
  } else {
    displayTitle = isIde ? tinyAsciiLogoIde : tinyAsciiLogo;
  }

  const artWidth = getAsciiArtWidth(displayTitle);

  return (
    <Box
      alignItems="flex-start"
      width={artWidth}
      flexShrink={0}
      flexDirection="column"
    >
      <ThemedGradient>{displayTitle}</ThemedGradient>
      {nightly && (
        <Box width="100%" flexDirection="row" justifyContent="flex-end">
          <ThemedGradient>v{version}</ThemedGradient>
        </Box>
      )}
    </Box>
  );
};
