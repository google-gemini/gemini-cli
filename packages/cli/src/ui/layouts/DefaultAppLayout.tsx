/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { Notifications } from '../components/Notifications.js';
import { MainContent } from '../components/MainContent.js';
import { DialogManager } from '../components/DialogManager.js';
import { Composer } from '../components/Composer.js';
import { ExitWarning } from '../components/ExitWarning.js';
import { useUIState } from '../contexts/UIStateContext.js';

export const DefaultAppLayout: React.FC<{ width?: string }> = ({
  width = '90%',
}) => {
  const uiState = useUIState();

  return (
    <Box flexDirection="column" width={width}>
      <MainContent />

      <Box flexDirection="column" ref={uiState.mainControlsRef}>
        <Notifications />

        {uiState.dialogsVisible ? (
          <DialogManager
            terminalWidth={uiState.terminalWidth}
            addItem={uiState.historyManager.addItem}
          />
        ) : (
          <Composer />
        )}

        <ExitWarning />
      </Box>
    </Box>
  );
};
