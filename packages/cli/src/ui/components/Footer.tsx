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
  cliVersion: string;
}

export const Footer: React.FC<FooterProps> = ({
  config,
  queryLength,
  debugMode,
  debugMessage,
  cliVersion,
}) => (
  <Box marginTop={1} display="flex" justifyContent="space-between" width="100%">
    {/* Left Section: Help/DebugMode */}
    <Box>
      <Text color={Colors.SubtleComment}>
        {queryLength === 0 ? '? for shortcuts' : ''}
        {debugMode && (
          <Text color={Colors.AccentRed}>
            {' '}
            {debugMessage || 'Running in debug mode.'}
          </Text>
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
      {process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec' ? (
        <Text color="green">
          {process.env.SANDBOX.replace(/^gemini-(?:code-)?/, '')}
        </Text>
      ) : process.env.SANDBOX === 'sandbox-exec' ? (
        <Text color={Colors.AccentYellow}>
          sandbox-exec ({process.env.SEATBELT_PROFILE})
        </Text>
      ) : (
        <Text color={Colors.AccentRed}>no sandbox (see README)</Text>
      )}
    </Box>

    {/* Right Section: Gemini Label */}
    <Box>
      <Text color={Colors.AccentBlue}> {config.getModel()} </Text>
      <Text color={Colors.SubtleComment}>| CLI {cliVersion} </Text>
    </Box>
  </Box>
);
