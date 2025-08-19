/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';

import { ConsoleSummaryDisplay } from './ConsoleSummaryDisplay.js';
import process from 'node:process';

import { MemoryUsageDisplay } from './MemoryUsageDisplay.js';
import { ContextUsageDisplay } from './ContextUsageDisplay.js';
import { DebugProfiler } from './DebugProfiler.js';

import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { isNarrowWidth } from '../utils/isNarrowWidth.js';

interface FooterProps {
  model: string;
  debugMode: boolean;
  debugMessage: string;
  corgiMode: boolean;
  errorCount: number;
  showErrorDetails: boolean;
  showMemoryUsage?: boolean;
  promptTokenCount: number;
  vimMode?: string;
  isTrustedFolder?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  model,
  debugMode,
  debugMessage,
  corgiMode,
  errorCount,
  showErrorDetails,
  showMemoryUsage,
  promptTokenCount,
  vimMode,
  isTrustedFolder,
}) => {
  const { columns: terminalWidth } = useTerminalSize();

  const isNarrow = isNarrowWidth(terminalWidth);

  return (
    <Box
      justifyContent="space-between"
      width="100%"
      flexDirection={isNarrow ? 'column' : 'row'}
      alignItems={isNarrow ? 'flex-start' : 'center'}
    >
      <Box>
        {debugMode && <DebugProfiler />}
        {vimMode && <Text color={theme.text.secondary}>[{vimMode}] </Text>}
        {debugMode && (
          <Text color={theme.status.error}>
            {' ' + (debugMessage || '--debug')}
          </Text>
        )}
      </Box>

      {/* Gemini Label and Console Summary */}
      <Box
        flexGrow={isNarrow ? 0 : 1}
        alignItems="flex-start"
        justifyContent={isNarrow ? 'flex-start' : 'flex-start'}
        display="flex"
        paddingTop={isNarrow ? 1 : 0}
      >
        <Text color={theme.text.accent}>
          {isNarrow ? '' : ' '}
          {model}{' '}
          <ContextUsageDisplay
            promptTokenCount={promptTokenCount}
            model={model}
          />
        </Text>
        {corgiMode && (
          <Text>
            <Text color={theme.ui.symbol}>| </Text>
            <Text color={theme.status.error}>▼</Text>
            <Text color={theme.text.primary}>(´</Text>
            <Text color={theme.status.error}>ᴥ</Text>
            <Text color={theme.text.primary}>`)</Text>
            <Text color={theme.status.error}>▼ </Text>
          </Text>
        )}
        {!showErrorDetails && errorCount > 0 && (
          <Box>
            <Text color={theme.ui.symbol}>| </Text>
            <ConsoleSummaryDisplay errorCount={errorCount} />
          </Box>
        )}
        {showMemoryUsage && <MemoryUsageDisplay />}
      </Box>

      {/* Right Section: Centered Trust/Sandbox Info */}
      <Box alignItems="center" paddingTop={isNarrow ? 1 : 0}>
        {isTrustedFolder === false ? (
          <Text color={theme.status.warning}>untrusted</Text>
        ) : process.env['SANDBOX'] &&
          process.env['SANDBOX'] !== 'sandbox-exec' ? (
          <Text color="green">
            {process.env['SANDBOX'].replace(/^gemini-(?:cli-)?/, '')}
          </Text>
        ) : process.env['SANDBOX'] === 'sandbox-exec' ? (
          <Text color={theme.status.warning}>
            macOS Seatbelt{' '}
            <Text color={theme.text.secondary}>
              ({process.env['SEATBELT_PROFILE']})
            </Text>
          </Text>
        ) : (
          <Text color={theme.status.error}>no sandbox</Text>
        )}
      </Box>
    </Box>
  );
};
