/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

interface FooterProps {
  queryLength: number;
  debugMode: boolean;
  debugMessage: string;
}

export const Footer: React.FC<FooterProps> = ({
  queryLength,
  debugMode,
  debugMessage,
}) => (
  <Box
    marginTop={1}
    display="flex"
    justifyContent="space-between"
    width="100%"
  >
    {/* Left Section: Help/DebugMode */}
    <Box>
      <Text color={Colors.SubtleComment}>
        {queryLength === 0 ? '? for shortcuts' : ''}
        {debugMode && (
          <Text color="red"> {debugMessage || 'Running in debug mode.'}</Text>
        )}
      </Text>
    </Box>

    {/* Middle Section: Centered Sandbox Info */}
    <Box
      flexGrow={1}
      alignItems="center"
      justifyContent="center"
      display="flex"
    >
      {process.env.SANDBOX ? (
        <Text color="green"> {process.env.SANDBOX} </Text>
      ) : (
        <Text color="red"> WARNING: OUTSIDE SANDBOX </Text>
      )}
    </Box>

    {/* Right Section: Gemini Label */}
    <Box>
      <Text color={Colors.AccentBlue}>Gemini</Text>
    </Box>
  </Box>
);
