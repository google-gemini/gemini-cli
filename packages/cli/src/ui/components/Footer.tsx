/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { shortenPath, tildeifyPath, Config } from '@gemini-code/server';

interface FooterProps {
  config: Config;
  debugMode: boolean;
  debugMessage: string;
  cliVersion: string;
  corgiMode: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  config,
  debugMode,
  debugMessage,
  cliVersion,
  corgiMode,
}) => (
  <Box marginTop={1}>
    <Box>
      <Text color={Colors.LightBlue}>
        {shortenPath(tildeifyPath(config.getTargetDir()), 70)}
      </Text>
      {debugMode && (
        <Text color={Colors.AccentRed}>
          {' ' + (debugMessage || '--debug')}
        </Text>
      )}
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
      {corgiMode && (
        <Text>
          <Text color={Colors.SubtleComment}>| </Text>
          <Text color={Colors.AccentRed}>▼</Text>
          <Text color={Colors.Foreground}>(´</Text>
          <Text color={Colors.AccentRed}>ᴥ</Text>
          <Text color={Colors.Foreground}>`)</Text>
          <Text color={Colors.AccentRed}>▼ </Text>
        </Text>
      )}
    </Box>
  </Box>
);
