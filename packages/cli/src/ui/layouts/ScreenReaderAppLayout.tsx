/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box } from 'ink';
import { StreamingContext } from '../contexts/StreamingContext.js';
import { Notifications } from '../components/Notifications.js';
import { MainContent } from '../components/MainContent.js';
import { DialogManager } from '../components/DialogManager.js';
import { Composer } from '../components/Composer.js';
import { Footer } from '../components/Footer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettings } from '../contexts/SettingsContext.js';

export const ScreenReaderAppLayout: React.FC = () => {
  const uiState = useUIState();
  const config = useConfig();
  const settings = useSettings();

  return (
    <StreamingContext.Provider value={uiState.streamingState}>
      <Box flexDirection="column" width="90%" height="100%">
        <Notifications />
        <Footer
          model={config.getModel()}
          targetDir={config.getTargetDir()}
          debugMode={config.getDebugMode()}
          branchName={uiState.branchName}
          debugMessage={uiState.debugMessage}
          corgiMode={uiState.corgiMode}
          errorCount={uiState.errorCount}
          showErrorDetails={uiState.showErrorDetails}
          showMemoryUsage={
            config.getDebugMode() || settings.merged.ui?.showMemoryUsage || false
          }
          promptTokenCount={uiState.sessionStats.lastPromptTokenCount}
          nightly={uiState.nightly}
          isTrustedFolder={uiState.isTrustedFolder}
          vimMode={undefined}
        />
        <Box flexGrow={1} overflow="hidden">
          <MainContent />
        </Box>
        {uiState.dialogsVisible ? <DialogManager /> : <Composer />}
      </Box>
    </StreamingContext.Provider>
  );
};