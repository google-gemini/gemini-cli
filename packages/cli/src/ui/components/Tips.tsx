/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

export const Tips: React.FC = () => (
  <Box flexDirection="column" marginBottom={1}>
    <Text color={Colors.Foreground}>Tips for getting started:</Text>
    <Text color={Colors.Foreground}>
      1.{' '}
      <Text bold color={Colors.AccentPurple}>
        /help
      </Text>{' '}
      for more information.
    </Text>
    <Text color={Colors.Foreground}>
      2.{' '}
      <Text bold color={Colors.AccentPurple}>
        /init
      </Text>{' '}
      to create a GEMINI.md for instructions & context.
    </Text>
    <Text color={Colors.Foreground}>
      3. Ask coding questions, edit code or run commands.
    </Text>
    <Text color={Colors.Foreground}>4. Be specific for the best results.</Text>
  </Box>
);
