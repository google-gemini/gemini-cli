/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { HistoryList } from './HistoryList.js';
import { PendingHistoryList } from './PendingHistoryList.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useAppContext } from '../contexts/AppContext.js';
import { AppHeader } from './AppHeader.js';
import { useLayoutConfig } from '../hooks/useLayoutConfig.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

export const MainContent = () => {
  const { version } = useAppContext();
  const uiState = useUIState();
  const layout = useLayoutConfig();
  const { columns: terminalWidth } = useTerminalSize();
  const {
    pendingHistoryItems,
    mainAreaWidth,
    staticAreaMaxItemHeight,
    availableTerminalHeight,
  } = uiState;

  // In screen reader mode, use regular layout without Static component

  if (!layout.shouldUseStatic) {
    return (
      <OverflowProvider>
        <Box flexDirection="column">
          <AppHeader version={version} />
          <HistoryList
            history={uiState.history}
            terminalWidth={terminalWidth}
            staticAreaMaxItemHeight={staticAreaMaxItemHeight}
            slashCommands={uiState.slashCommands}
          />
          <PendingHistoryList
            pendingHistoryItems={pendingHistoryItems}
            terminalWidth={mainAreaWidth}
            availableTerminalHeight={availableTerminalHeight}
            constrainHeight={uiState.constrainHeight}
            isEditorDialogOpen={uiState.isEditorDialogOpen}
          />
          <ShowMoreLines constrainHeight={uiState.constrainHeight} />
        </Box>
      </OverflowProvider>
    );
  }

  // Default mode with Static component
  return (
    <>
      <OverflowProvider>
        <Box flexDirection="column">
          <AppHeader version={version} />
          <HistoryList
            history={uiState.history}
            terminalWidth={terminalWidth}
            staticAreaMaxItemHeight={staticAreaMaxItemHeight}
            slashCommands={uiState.slashCommands}
          />
        </Box>
      </OverflowProvider>
      <OverflowProvider>
        <Box flexDirection="column">
          <PendingHistoryList
            pendingHistoryItems={pendingHistoryItems}
            terminalWidth={mainAreaWidth}
            availableTerminalHeight={availableTerminalHeight}
            constrainHeight={uiState.constrainHeight}
            isEditorDialogOpen={uiState.isEditorDialogOpen}
            activePtyId={uiState.activePtyId?.toString()}
            embeddedShellFocused={uiState.embeddedShellFocused}
          />
          <ShowMoreLines constrainHeight={uiState.constrainHeight} />
        </Box>
      </OverflowProvider>
    </>
  );
};
