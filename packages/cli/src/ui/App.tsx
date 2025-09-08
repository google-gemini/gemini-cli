/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, useStdout } from 'ink';
import { StreamingContext } from './contexts/StreamingContext.js';
import { Notifications } from './components/Notifications.js';
import { MainContent } from './components/MainContent.js';
import { DialogManager } from './components/DialogManager.js';
import { Composer } from './components/Composer.js';
import { useUIState } from './contexts/UIStateContext.js';
import { QuittingDisplay } from './components/QuittingDisplay.js';

const getContainerWidth = (terminalWidth: number): string => {
  if (terminalWidth <= 80) {
    return '98%';
  }
  if (terminalWidth >= 132) {
    return '90%';
  }

  // Linearly interpolate between 80 columns (98%) and 132 columns (90%).
  const slope = (90 - 98) / (132 - 80); // -0.1538...
  const percentage = 98 + slope * (terminalWidth - 80);

  return `${Math.round(percentage)}%`;
};

export const App = () => {
  const uiState = useUIState();
  const { stdout } = useStdout();
  const containerWidth = getContainerWidth(stdout.columns);

  if (uiState.quittingMessages) {
    return <QuittingDisplay />;
  }

  return (
    <StreamingContext.Provider value={uiState.streamingState}>
      <Box flexDirection="column" width={containerWidth}>
        <MainContent />

        <Box flexDirection="column" ref={uiState.mainControlsRef}>
          <Notifications />

          {uiState.dialogsVisible ? <DialogManager /> : <Composer />}
        </Box>
      </Box>
    </StreamingContext.Provider>
  );
};
