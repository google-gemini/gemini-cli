/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { Colors } from '../colors.js';

const asciiArtLogo = `
 ██████╗ ███████╗███╗   ███╗██╗███╗   ██╗██╗
██╔════╝ ██╔════╝████╗ ████║██║████╗  ██║██║
██║  ███╗█████╗  ██╔████╔██║██║██╔██╗ ██║██║
██║   ██║██╔══╝  ██║╚██╔╝██║██║██║╚██╗██║██║
╚██████╔╝███████╗██║ ╚═╝ ██║██║██║ ╚████║██║
 ╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝
`;

interface HeaderProps {
  title?: string;
}

export const Header: React.FC<HeaderProps> = ({ title = asciiArtLogo }) => (
  <>
    <Box marginBottom={1} alignItems="flex-start">
      {Colors.GradientColors ? (
        <Gradient colors={Colors.GradientColors}>
          <Text>{title}</Text>
        </Gradient>
      ) : (
        <Text>{title}</Text>
      )}
    </Box>
  </>
);
