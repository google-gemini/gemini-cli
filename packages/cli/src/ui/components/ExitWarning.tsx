/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import { theme } from '../semantic-colors.js';
import { TransientMessageType } from '../../utils/events.js';

export const ExitWarning: React.FC = () => {
  const uiState = useUIState();
  if (!uiState.dialogsVisible) {
    return null;
  }

  if (
    uiState.transientMessage?.type === TransientMessageType.Warning &&
    uiState.transientMessage.message
  ) {
    return (
      <Box marginTop={1}>
        <Text color={theme.status.warning}>{uiState.transientMessage.message}</Text>
      </Box>
    );
  }

  return null;
};
