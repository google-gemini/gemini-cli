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
import { ToolConfirmationQueue } from '../components/ToolConfirmationQueue.js';
import { useConfirmingTool } from '../hooks/useConfirmingTool.js';
import { useConfig } from '../contexts/ConfigContext.js';

export const DefaultAppLayout: React.FC = () => {
  const uiState = useUIState();
  const config = useConfig();
  const isAlternateBuffer = useAlternateBuffer();

  // If the event-driven scheduler is enabled AND we have a tool waiting,
  // we switch the footer mode to "Queue".
  const confirmingTool = useConfirmingTool();
  const showConfirmationQueue =
    config.isEventDrivenSchedulerEnabled() && confirmingTool !== null;

  const { rootUiRef, terminalHeight } = uiState;
  useFlickerDetector(rootUiRef, terminalHeight);
  // If in alternate buffer mode, need to leave room to draw the scrollbar on
  // the right side of the terminal.
  const width = isAlternateBuffer
    ? uiState.terminalWidth
    : uiState.mainAreaWidth;
  return (
    <Box
      flexDirection="column"
      width={width}
      height={isAlternateBuffer ? terminalHeight : undefined}
      paddingBottom={isAlternateBuffer ? 1 : undefined}
      flexShrink={0}
      flexGrow={0}
      overflow="hidden"
      ref={uiState.rootUiRef}
    >
      <MainContent />

      <Box
        flexDirection="column"
        ref={uiState.mainControlsRef}
        flexShrink={0}
        flexGrow={0}
      >
        <Notifications />
        <CopyModeWarning />

        {uiState.customDialog ? (
          uiState.customDialog
        ) : uiState.dialogsVisible ? (
          <DialogManager
            terminalWidth={uiState.mainAreaWidth}
            addItem={uiState.historyManager.addItem}
          />
        ) : (
          <>
            {showConfirmationQueue && confirmingTool && (
              <ToolConfirmationQueue confirmingTool={confirmingTool} />
            )}
            <Composer isFocused={!showConfirmationQueue} />
          </>
        )}

        <ExitWarning />
      </Box>
    </Box>
  );
};
