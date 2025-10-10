/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Static } from 'ink';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { ShowMoreLines } from './ShowMoreLines.js';
import { OverflowProvider } from '../contexts/OverflowContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useAppContext } from '../contexts/AppContext.js';
import { AppHeader } from './AppHeader.js';
import { useLayoutConfig } from '../hooks/useLayoutConfig.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

// Limit Gemini messages to a very high number of lines to mitigate performance
// issues in the worst case if we somehow get an enormous response from Gemini.
// This threshold is arbitrary but should be high enough to never impact normal
// usage.
const MAX_GEMINI_MESSAGE_LINES = 65536;

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
  return (
    <>
      <Static
        key={uiState.historyRemountKey}
        items={[
          <AppHeader key="app-header" version={version} />,
          ...uiState.history.map((h) => (
            <HistoryItemDisplay
              terminalWidth={mainAreaWidth}
              availableTerminalHeight={staticAreaMaxItemHeight}
              availableTerminalHeightGemini={MAX_GEMINI_MESSAGE_LINES}
              key={h.id}
              item={h}
              isPending={false}
              commands={uiState.slashCommands}
            />
          )),
        ]}
      >
        {(item) => item}
      </Static>
      <OverflowProvider>
        <Box flexDirection="column" width={mainAreaWidth}>
          {pendingHistoryItems.map((item, i) => (
            <HistoryItemDisplay
              key={i}
              availableTerminalHeight={
                uiState.constrainHeight ? availableTerminalHeight : undefined
              }
              terminalWidth={mainAreaWidth}
              item={{ ...item, id: 0 }}
              isPending={true}
              isFocused={!uiState.isEditorDialogOpen}
              activeShellPtyId={uiState.activePtyId}
              embeddedShellFocused={uiState.embeddedShellFocused}
            />
          ))}
          <ShowMoreLines constrainHeight={uiState.constrainHeight} />
        </Box>
      </OverflowProvider>
    </>
  );
};
