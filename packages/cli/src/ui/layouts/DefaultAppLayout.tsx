/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Notifications } from '../components/Notifications.js';
import { MainContent } from '../components/MainContent.js';
import { DialogManager } from '../components/DialogManager.js';
import { Composer } from '../components/Composer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { theme } from '../semantic-colors.js';

export const DefaultAppLayout: React.FC = () => {
  const uiState = useUIState();

  return (
    <Box flexDirection="column" width="90%">
      <MainContent />

      <Box flexDirection="column" ref={uiState.mainControlsRef}>
        <Notifications />

        {uiState.dialogsVisible ? (
          <DialogManager addItem={uiState.historyManager.addItem} />
        ) : (
          <Composer />
        )}

        {uiState.dialogsVisible && uiState.ctrlCPressedOnce && (
          <Box marginTop={1}>
            <Text color={theme.status.warning}>
              Press Ctrl+C again to exit.
            </Text>
          </Box>
        )}

        {uiState.dialogsVisible && uiState.ctrlDPressedOnce && (
          <Box marginTop={1}>
            <Text color={theme.status.warning}>
              Press Ctrl+D again to exit.
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
