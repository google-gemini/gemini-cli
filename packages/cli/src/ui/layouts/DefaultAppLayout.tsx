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
import { AppHeader } from '../components/AppHeader.js';
import { TopicStickyHeader } from '../components/TopicStickyHeader.js';
import { ExitWarning } from '../components/ExitWarning.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { useFlickerDetector } from '../hooks/useFlickerDetector.js';
import { CopyModeWarning } from '../components/CopyModeWarning.js';
import { BackgroundTaskDisplay } from '../components/BackgroundTaskDisplay.js';
import { StreamingState } from '../types.js';
import { useAppContext } from '../contexts/AppContext.js';

export const DefaultAppLayout: React.FC = () => {
  const { version } = useAppContext();
  const uiState = useUIState();
  const isAlternateBuffer = useAlternateBuffer();

  const { rootUiRef, terminalHeight, cleanUiDetailsVisible } = uiState;
  useFlickerDetector(rootUiRef, terminalHeight);
  // If in alternate buffer mode, need to leave room to draw the scrollbar on
  // the right side of the terminal.
  return (
    <Box
      flexDirection="column"
      width={uiState.terminalWidth}
      height={isAlternateBuffer ? terminalHeight : undefined}
      paddingBottom={isAlternateBuffer ? 1 : undefined}
      flexShrink={0}
      flexGrow={0}
      overflow="hidden"
      ref={uiState.rootUiRef}
    >
      <AppHeader version={version} showDetails={cleanUiDetailsVisible} />
      <TopicStickyHeader />
      <MainContent />

      {uiState.isBackgroundTaskVisible &&
        uiState.backgroundTasks.size > 0 &&
        uiState.activeBackgroundTaskPid &&
        uiState.backgroundTaskHeight > 0 &&
        uiState.streamingState !== StreamingState.WaitingForConfirmation && (
          <Box height={uiState.backgroundTaskHeight} flexShrink={0}>
            <BackgroundTaskDisplay
              shells={uiState.backgroundTasks}
              activePid={uiState.activeBackgroundTaskPid}
              width={uiState.terminalWidth}
              height={uiState.backgroundTaskHeight}
              isFocused={
                uiState.embeddedShellFocused && !uiState.dialogsVisible
              }
              isListOpenProp={uiState.isBackgroundTaskListOpen}
            />
          </Box>
        )}
      <Box
        flexDirection="column"
        ref={uiState.mainControlsRef}
        flexShrink={0}
        flexGrow={0}
        width={uiState.terminalWidth}
        height={
          uiState.copyModeEnabled ? uiState.stableControlsHeight : undefined
        }
      >
        <Notifications />
        <CopyModeWarning />

        {uiState.customDialog ? (
          uiState.customDialog
        ) : uiState.dialogsVisible ? (
          <DialogManager
            terminalWidth={uiState.terminalWidth}
            addItem={uiState.historyManager.addItem}
          />
        ) : (
          <Composer isFocused={true} />
        )}

        <ExitWarning />
      </Box>
    </Box>
  );
};
