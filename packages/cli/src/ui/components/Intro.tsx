/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Newline, Text } from 'ink';
import { Colors } from '../colors.js';

export const Intro: React.FC = () => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={Colors.Foreground}>Abilities:</Text>
    <Text color={Colors.Foreground}>  * Use tools to read and write files</Text>
    <Text color={Colors.Foreground}>  * Semantically search and understand code</Text>
    <Text color={Colors.Foreground}>  * Execute bash commands</Text>
    <Newline/>
    <Text bold color={Colors.Foreground}>Commands:</Text>
    <Text color={Colors.SubtleComment}>
      <Text bold color={Colors.AccentPurple}>  /help</Text>
      {' '}- prints this help
    </Text>
    <Text color={Colors.SubtleComment}>
      <Text bold color={Colors.AccentPurple}>  /clear</Text>
      {' '}- clear the screen
    </Text>
    <Text color={Colors.SubtleComment}>
      <Text bold color={Colors.AccentPurple}>  /exit</Text>
    </Text>
    <Text color={Colors.SubtleComment}>
      <Text bold color={Colors.AccentPurple}>  /quit</Text>
    </Text>
  </Box>
);
