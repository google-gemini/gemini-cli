/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { Colors } from '../colors.js';
import { shortAsciiLogo, longAsciiLogo, shortGrokLogo, longGrokLogo } from './AsciiArt.js';
import { getAsciiArtWidth } from '../utils/textUtils.js';

interface HeaderProps {
  customAsciiArt?: string; // For user-defined ASCII art
  terminalWidth: number; // For responsive logo
  model?: string; // Current model name
}

export const Header: React.FC<HeaderProps> = ({
  customAsciiArt,
  terminalWidth,
  model,
}) => {
  let displayTitle;
  const widthOfLongLogo = getAsciiArtWidth(longAsciiLogo);
  
  // Check if using a Grok model
  const isGrokModel = model && (model.startsWith('grok-') || model === 'grok');

  if (customAsciiArt) {
    displayTitle = customAsciiArt;
  } else if (isGrokModel) {
    // Use Grok banners for Grok models
    displayTitle =
      terminalWidth >= widthOfLongLogo ? longGrokLogo : shortGrokLogo;
  } else {
    // Use Gemini banners for all other models
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
    >
      {Colors.GradientColors ? (
        <Gradient colors={Colors.GradientColors}>
          <Text>{displayTitle}</Text>
        </Gradient>
      ) : (
        <Text>{displayTitle}</Text>
      )}
    </Box>
  );
};
