/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { Colors } from '../colors.js';
import { shortAsciiLogo, longAsciiLogo } from './AsciiArt.js';
import { getAsciiArtWidth } from '../utils/textUtils.js';

interface HeaderProps {
  customAsciiArt?: string; // For user-defined ASCII art
  terminalWidth: number; // For responsive logo
  version: string;
  nightly: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  customAsciiArt,
  terminalWidth,
  version,
  nightly,
}) => {
  let displayTitle;
  const widthOfLongLogo = getAsciiArtWidth(longAsciiLogo);

  if (customAsciiArt) {
    displayTitle = customAsciiArt;
  } else {
    displayTitle =
      terminalWidth >= widthOfLongLogo ? longAsciiLogo : shortAsciiLogo;
  }

  const artWidth = getAsciiArtWidth(displayTitle);

  return (
    <Box
      marginBottom={1}
      alignItems="flex-start"
      width={artWidth}
      flexShrink={0}
      flexDirection="column"
    >
      {Colors.GradientColors ? (
        <Gradient colors={Colors.GradientColors}>
          <Text>{displayTitle}</Text>
        </Gradient>
      ) : (
        <Text>{displayTitle}</Text>
      )}
      {nightly && (
        <Box width="100%" flexDirection="row" justifyContent="flex-end">
          <Gradient colors={Colors.GradientColors}>
            <Text>v{version}</Text>
          </Gradient>
        </Box>
      )}
    </Box>
  );
};
