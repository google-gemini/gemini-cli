/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { shortenPath, tildeifyPath } from '@gemini-code/core';
import { ConsoleSummaryDisplay } from './ConsoleSummaryDisplay.js';
import process from 'node:process';
import { MemoryUsageDisplay } from './MemoryUsageDisplay.js';

interface FooterProps {
  model: string;
  targetDir: string;
  branchName?: string;
  debugMode: boolean;
  debugMessage: string;
  cliVersion: string;
  corgiMode: boolean;
  errorCount: number;
  showErrorDetails: boolean;
  showMemoryUsage?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  model,
  targetDir,
  branchName,
  debugMode,
  debugMessage,
  corgiMode,
  errorCount,
  showErrorDetails,
  showMemoryUsage,
}) => (
  <Box marginTop={1} justifyContent="space-between" width="100%">
    <Box>
      <Text color={Colors.LightBlue}>
        {shortenPath(tildeifyPath(targetDir), 70)}
        {branchName && <Text color={Colors.Gray}> ({branchName}*)</Text>}
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
          {process.env.SANDBOX.replace(/^gemini-(?:cli-)?/, '')}
        </Text>
      ) : process.env.SANDBOX === 'sandbox-exec' ? (
        <Text color={Colors.AccentYellow}>
          sandbox-exec{' '}
          <Text color={Colors.Gray}>({process.env.SEATBELT_PROFILE})</Text>
        </Text>
      ) : (
        <Text color={Colors.AccentRed}>
          no sandbox <Text color={Colors.Gray}>(see README)</Text>
        </Text>
      )}
    </Box>

    {/* Right Section: Gemini Label and Console Summary */}
    <Box alignItems="center">
      <Text color={Colors.AccentBlue}> {model} </Text>
      {corgiMode && (
        <Text>
          <Text color={Colors.Gray}>| </Text>
          <Text color={Colors.AccentRed}>▼</Text>
          <Text color={Colors.Foreground}>(´</Text>
          <Text color={Colors.AccentRed}>ᴥ</Text>
          <Text color={Colors.Foreground}>`)</Text>
          <Text color={Colors.AccentRed}>▼ </Text>
        </Text>
      )}
      {!showErrorDetails && errorCount > 0 && (
        <Box>
          <Text color={Colors.Gray}>| </Text>
          <ConsoleSummaryDisplay errorCount={errorCount} />
        </Box>
      )}
      {showMemoryUsage && <MemoryUsageDisplay />}
    </Box>
  </Box>
);
