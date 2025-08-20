/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { Colors } from '../colors.js';
import { shortAsciiLogo, longAsciiLogo, tinyAsciiLogo } from './AsciiArt.js';
import { getAsciiArtWidth } from '../utils/textUtils.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { LoadedSettings } from '../../config/settings.js';

interface HeaderProps {
  customAsciiArt?: string; // For user-defined ASCII art
  version: string;
  nightly: boolean;
  settings?: LoadedSettings;
}

export const Header: React.FC<HeaderProps> = ({
  customAsciiArt,
  version,
  nightly,
  settings,
}) => {
  const { columns: terminalWidth } = useTerminalSize();
  const isReaderMode = settings?.merged?.accessibility?.readerMode || false;

  let displayTitle;
  let artWidth;

  if (isReaderMode) {
    // Simplified banner for screen readers
    displayTitle = `GEMINI CLI${nightly ? ` v${version}` : ''}`;
    artWidth = displayTitle.length;
  } else {
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

    artWidth = getAsciiArtWidth(displayTitle);
  }

  return (
    <Box
      alignItems="flex-start"
      width={artWidth}
      flexShrink={0}
      flexDirection="column"
    >
      {Colors.GradientColors && !isReaderMode ? (
        <Gradient colors={Colors.GradientColors}>
          <Text>{displayTitle}</Text>
        </Gradient>
      ) : (
        <Text>{displayTitle}</Text>
      )}
      {nightly && !isReaderMode && (
        <Box width="100%" flexDirection="row" justifyContent="flex-end">
          {Colors.GradientColors ? (
            <Gradient colors={Colors.GradientColors}>
              <Text>v{version}</Text>
            </Gradient>
          ) : (
            <Text>v{version}</Text>
          )}
        </Box>
      )}
    </Box>
  );
};
