/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { ThemedGradient } from './ThemedGradient.js';
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
import { useSnowfall } from '../hooks/useSnowfall.js';

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
  const isHolidaySeason = new Date().getMonth() === 11;

  let paddedTitle = displayTitle;

  if (isHolidaySeason) {
    const holidayTree = `
      *
     ***
    *****
   *******
  *********
     |_|`;

    const treeLines = holidayTree.split('\n').filter((l) => l.length > 0);
    const treeWidth = getAsciiArtWidth(holidayTree);
    const logoWidth = getAsciiArtWidth(displayTitle);

    // Create three trees side by side
    const treeSpacing = '        ';
    const tripleTreeLines = treeLines.map((line) => {
      const paddedLine = line.padEnd(treeWidth, ' ');
      return `${paddedLine}${treeSpacing}${paddedLine}${treeSpacing}${paddedLine}`;
    });

    const tripleTreeWidth = treeWidth * 3 + treeSpacing.length * 2;
    const paddingCount = Math.max(
      0,
      Math.floor((logoWidth - tripleTreeWidth) / 2),
    );
    const treePadding = ' '.repeat(paddingCount);

    const centeredTripleTrees = tripleTreeLines
      .map((line) => treePadding + line)
      .join('\n');

    // Add vertical padding and the trees below the logo
    paddedTitle = `\n\n${displayTitle}\n${centeredTripleTrees}\n\n`;
  } else {
    paddedTitle = displayTitle;
  }

  const snowTitle = useSnowfall(paddedTitle, isHolidaySeason);
  const holidayColors = ['#D6001C', '#00873E']; // Red and Green

  return (
    <Box
      alignItems="flex-start"
      width={artWidth}
      flexShrink={0}
      flexDirection="column"
    >
      <ThemedGradient colors={isHolidaySeason ? holidayColors : undefined}>
        {snowTitle}
      </ThemedGradient>
      {nightly && (
        <Box width="100%" flexDirection="row" justifyContent="flex-end">
          <ThemedGradient>v{version}</ThemedGradient>
        </Box>
      )}
    </Box>
  );
};
