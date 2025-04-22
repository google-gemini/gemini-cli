/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { Config } from '@gemini-code/server';

interface FooterProps {
  config: Config;
  queryLength: number;
  debugMode: boolean;
  debugMessage: string;
}

export const Footer: React.FC<FooterProps> = ({
  config,
  queryLength,
  debugMode,
  debugMessage,
}) => (
  <Box marginTop={1} display="flex" justifyContent="space-between" width="100%">
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
      <Text color={Colors.AccentBlue}> {config.getModel()} </Text>
    </Box>
  </Box>
);
