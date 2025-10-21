/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import { useAppContext } from '../contexts/AppContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { theme } from '../semantic-colors.js';
import { StreamingState } from '../types.js';
import { UpdateNotification } from './UpdateNotification.js';

import { GEMINI_DIR } from '@google/gemini-cli-core';
import { homedir } from 'node:os';
import path from 'node:path';

const settingsPath = path.join(homedir(), GEMINI_DIR, 'settings.json');

export const Notifications = () => {
  const { startupWarnings } = useAppContext();
  const { initError, streamingState, updateInfo } = useUIState();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const showStartupWarnings = startupWarnings.length > 0;
  const showInitError =
    initError && streamingState !== StreamingState.Responding;

  if (
    !showStartupWarnings &&
    !showInitError &&
    !updateInfo &&
    !isScreenReaderEnabled
  ) {
    return null;
  }

  return (
    <>
      {isScreenReaderEnabled && (
        <Text>
          You are currently in screen reader-friendly view. To switch out, open{' '}
          {settingsPath} and remove the entry for {'"screenReader"'}.
        </Text>
      )}
      {updateInfo && <UpdateNotification message={updateInfo.message} />}
      {showStartupWarnings && (
        <Box
          borderStyle="round"
          borderColor={theme.status.warning}
          paddingX={1}
          marginY={1}
          flexDirection="column"
        >
          {startupWarnings.map((warning, index) => (
            <Text key={index} color={theme.status.warning}>
              {warning}
            </Text>
          ))}
        </Box>
      )}
      {showInitError && (
        <Box
          borderStyle="round"
          borderColor={theme.status.error}
          paddingX={1}
          marginBottom={1}
        >
          <Text color={theme.status.error}>
            Initialization Error: {initError}
          </Text>
          <Text color={theme.status.error}>
            {' '}
            Please check API key and configuration.
          </Text>
        </Box>
      )}
    </>
  );
};
