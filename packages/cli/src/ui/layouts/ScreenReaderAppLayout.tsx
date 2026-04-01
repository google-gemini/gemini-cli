/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box } from 'ink';
import { Notifications } from '../components/Notifications.js';
import { MainContent } from '../components/MainContent.js';
import { AppHeader } from '../components/AppHeader.js';
import { TopicStickyHeader } from '../components/TopicStickyHeader.js';
import { DialogManager } from '../components/DialogManager.js';
import { Composer } from '../components/Composer.js';
import { Footer } from '../components/Footer.js';
import { ExitWarning } from '../components/ExitWarning.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useFlickerDetector } from '../hooks/useFlickerDetector.js';
import { useAppContext } from '../contexts/AppContext.js';

export const ScreenReaderAppLayout: React.FC = () => {
  const { version } = useAppContext();
  const uiState = useUIState();
  const { rootUiRef, terminalHeight, cleanUiDetailsVisible } = uiState;
  useFlickerDetector(rootUiRef, terminalHeight);

  return (
    <Box
      flexDirection="column"
      width="90%"
      height="100%"
      ref={uiState.rootUiRef}
    >
      <AppHeader version={version} showDetails={cleanUiDetailsVisible} />
      <Notifications />
      <Footer />
      <Box flexGrow={1} overflow="hidden">
        <MainContent />
      </Box>
      {uiState.dialogsVisible ? (
        <DialogManager
          terminalWidth={uiState.terminalWidth}
          addItem={uiState.historyManager.addItem}
        />
      ) : (
        <Composer />
      )}

      <TopicStickyHeader />

      <ExitWarning />
    </Box>
  );
};
