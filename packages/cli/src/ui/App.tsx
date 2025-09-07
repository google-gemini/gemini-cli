/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { StreamingContext } from './contexts/StreamingContext.js';
import { Notifications } from './components/Notifications.js';
import { MainContent } from './components/MainContent.js';
import { DialogManager } from './components/DialogManager.js';
import { Composer } from './components/Composer.js';
import { useUIState } from './contexts/UIStateContext.js';
import { QuittingDisplay } from './components/QuittingDisplay.js';

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
        </Box>
      </Box>
    </StreamingContext.Provider>
  );
};
