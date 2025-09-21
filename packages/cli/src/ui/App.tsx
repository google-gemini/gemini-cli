/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { StreamingContext } from './contexts/StreamingContext.js';
import { Notifications } from './components/Notifications.js';
import { MainContent } from './components/MainContent.js';
import { DialogManager } from './components/DialogManager.js';
import { Composer } from './components/Composer.js';
import { useUIState } from './contexts/UIStateContext.js';
import { QuittingDisplay } from './components/QuittingDisplay.js';
import { theme } from './semantic-colors.js';

export const App = () => {
  const uiState = useUIState();

  if (uiState.quittingMessages) {
    return <QuittingDisplay />;
  }

  return (
    <StreamingContext.Provider value={uiState.streamingState}>
      <Box flexDirection="column" width="90%">
        <MainContent />

        <Box flexDirection="column" ref={uiState.mainControlsRef}>
          <Notifications />

          {uiState.dialogsVisible ? <DialogManager /> : <Composer />}

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
    </StreamingContext.Provider>
  );
};
