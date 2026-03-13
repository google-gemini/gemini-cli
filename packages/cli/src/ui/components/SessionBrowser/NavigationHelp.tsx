/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';

const Kbd = ({ name, shortcut }: { name: string; shortcut: string }) => (
  <>
    {name}: <Text bold>{shortcut}</Text>
  </>
);

/**
 * Navigation help component showing keyboard shortcuts.
 */
export const NavigationHelp = (): React.JSX.Element => (
  <Box flexDirection="column">
    <Text color={Colors.Gray}>
      <Kbd name="Navigate" shortcut="↑/↓" />
      {'   '}
      <Kbd name="Resume" shortcut="Enter" />
      {'   '}
      <Kbd name="Search" shortcut="/" />
      {'   '}
      <Kbd name="Delete" shortcut="x" />
      {'   '}
      <Kbd name="Quit" shortcut="q" />
    </Text>
    <Text color={Colors.Gray}>
      <Kbd name="Sort" shortcut="s" />
      {'         '}
      <Kbd name="Reverse" shortcut="r" />
      {'      '}
      <Kbd name="First/Last" shortcut="g/G" />
    </Text>
  </Box>
);
