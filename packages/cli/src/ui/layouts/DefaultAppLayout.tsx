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
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { CopyModeWarning } from '../components/CopyModeWarning.js';
import { BackgroundShellDisplay } from '../components/BackgroundShellDisplay.js';
import { StreamingState } from '../types.js';

export const DefaultAppLayout: React.FC = () => {
  const uiState = useUIState();
  const isAlternateBuffer = useAlternateBuffer();

  const { rootUiRef, terminalHeight } = uiState;
  useFlickerDetector(rootUiRef, terminalHeight);
  // If in alternate buffer mode, need to leave room to draw the scrollbar on
  // the right side of the terminal.
  return (
    <Box
      flexDirection="column"
      width={uiState.terminalWidth}
      height={isAlternateBuffer ? terminalHeight : undefined}
      paddingBottom={
        isAlternateBuffer && !uiState.copyModeEnabled ? 1 : undefined
      }
      flexShrink={0}
      flexGrow={0}
      overflow="hidden"
      ref={uiState.rootUiRef}
    >
      <MainContent />

      {uiState.isBackgroundShellVisible &&
        uiState.backgroundShells.size > 0 &&
        uiState.activeBackgroundShellPid &&
        uiState.backgroundShellHeight > 0 &&
        uiState.streamingState !== StreamingState.WaitingForConfirmation && (
          <Box height={uiState.backgroundShellHeight} flexShrink={0}>
            <BackgroundShellDisplay
              shells={uiState.backgroundShells}
              activePid={uiState.activeBackgroundShellPid}
              width={uiState.terminalWidth}
              height={uiState.backgroundShellHeight}
              isFocused={
                uiState.embeddedShellFocused && !uiState.dialogsVisible
              }
              isListOpenProp={uiState.isBackgroundShellListOpen}
            />
          </Box>
        )}
      <Box
        flexDirection="column"
        ref={uiState.mainControlsRef}
        flexShrink={0}
        flexGrow={0}
        width={uiState.terminalWidth}
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
