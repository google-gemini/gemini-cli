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
import { useSettings } from '../contexts/SettingsContext.js';

// Limit Gemini messages to a very high number of lines to mitigate performance
// issues in the worst case if we somehow get an enormous response from Gemini.
// This threshold is arbitrary but should be high enough to never impact normal
// usage.
const MAX_GEMINI_MESSAGE_LINES = 65536;

export const MainContent = () => {
  const { version } = useAppContext();
  const uiState = useUIState();
  const settings = useSettings();
  const useAlternateBuffer = settings.merged.ui?.useAlternateBuffer ?? false;

  const {
    pendingHistoryItems,
    mainAreaWidth,
    staticAreaMaxItemHeight,
    availableTerminalHeight,
  } = uiState;

  const historyItems = [
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
  ];

  const pendingItems = (
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
  );

  if (useAlternateBuffer) {
    // Placeholder alternate buffer implementation using a scrollable box that
    // is always scrolled to the bottom. In follow up PRs we will switch this
    // to a proper alternate buffer implementation.
    return (
      <Box
        flexDirection="column"
        overflowY="scroll"
        scrollTop={Number.MAX_SAFE_INTEGER}
        maxHeight={availableTerminalHeight}
      >
        <Box flexDirection="column" flexShrink={0}>
          {historyItems}
          {pendingItems}
        </Box>
      </Box>
    );
  }

  return (
    <>
      <Static key={uiState.historyRemountKey} items={historyItems}>
        {(item) => item}
      </Static>
      {pendingItems}
    </>
  );
};
