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
import { useFlickerDetector } from '../hooks/useFlickerDetector.js';
import { useSettings } from '../contexts/SettingsContext.js';

export const DefaultAppLayout: React.FC = () => {
  const uiState = useUIState();
  const { rootUiRef, terminalHeight } = uiState;
  const settings = useSettings();
  useFlickerDetector(rootUiRef, terminalHeight);

  return (
    <Box
      flexDirection="column"
      width={uiState.mainAreaWidth}
      ref={uiState.rootUiRef}
      height={
        settings.merged.ui?.useAlternateBuffer ? terminalHeight - 1 : undefined
      }
      flexShrink={0}
      flexGrow={0}
      overflow="hidden"
    >
      <MainContent />

      <Box flexDirection="column" ref={uiState.mainControlsRef}>
        <Notifications />

        {uiState.dialogsVisible ? (
          <DialogManager
            terminalWidth={uiState.mainAreaWidth}
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
