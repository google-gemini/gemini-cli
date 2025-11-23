/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { ThemedGradient } from './ThemedGradient.js';
import {
  shortAsciiLogo as defaultShortAsciiLogo,
  longAsciiLogo as defaultLongAsciiLogo,
  tinyAsciiLogo as defaultTinyAsciiLogo,
  shortAsciiLogoIde as defaultShortAsciiLogoIde,
  longAsciiLogoIde as defaultLongAsciiLogoIde,
  tinyAsciiLogoIde as defaultTinyAsciiLogoIde,
} from './AsciiArt.js';
import { getAsciiArtWidth } from '../utils/textUtils.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { getTerminalProgram } from '../utils/terminalSetup.js';
import type { LogoVariants } from '../hooks/useCustomLogo.js';

interface HeaderProps {
  customLogoVariants?: LogoVariants;
  version: string;
  nightly: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  customLogoVariants,
  version,
  nightly,
}) => {
  const { columns: terminalWidth } = useTerminalSize();
  const isIde = getTerminalProgram();

  const longAsciiLogo =
    customLogoVariants?.longAsciiLogo ?? defaultLongAsciiLogo;
  const shortAsciiLogo =
    customLogoVariants?.shortAsciiLogo ?? defaultShortAsciiLogo;
  const tinyAsciiLogo =
    customLogoVariants?.tinyAsciiLogo ?? defaultTinyAsciiLogo;
  const longAsciiLogoIde =
    customLogoVariants?.longAsciiLogoIde ?? defaultLongAsciiLogoIde;
  const shortAsciiLogoIde =
    customLogoVariants?.shortAsciiLogoIde ?? defaultShortAsciiLogoIde;
  const tinyAsciiLogoIde =
    customLogoVariants?.tinyAsciiLogoIde ?? defaultTinyAsciiLogoIde;

  let displayTitle;
  const widthOfLongLogo = getAsciiArtWidth(longAsciiLogo);
  const widthOfShortLogo = getAsciiArtWidth(shortAsciiLogo);

  if (terminalWidth >= widthOfLongLogo) {
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
