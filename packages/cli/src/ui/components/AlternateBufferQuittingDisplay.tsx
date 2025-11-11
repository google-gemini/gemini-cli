/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import { AppHeader } from './AppHeader.js';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { QuittingDisplay } from './QuittingDisplay.js';
import { useAppContext } from '../contexts/AppContext.js';
import { MAX_GEMINI_MESSAGE_LINES } from '../constants.js';

export const AlternateBufferQuittingDisplay = () => {
  const { version } = useAppContext();
  const uiState = useUIState();

  // We render the entire chat history and header here to ensure that the
  // conversation history is visible to the user after the app quits and the
  // user exits alternate buffer mode.
  // Our version of Ink is clever and will render a final frame outside of
  // the alternate buffer on app exit.
  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      flexGrow={0}
      width={uiState.terminalWidth}
    >
      <AppHeader key="app-header" version={version} />
      {uiState.history.map((h) => (
        <HistoryItemDisplay
          terminalWidth={uiState.mainAreaWidth}
          availableTerminalHeight={undefined}
          availableTerminalHeightGemini={MAX_GEMINI_MESSAGE_LINES}
          key={h.id}
          item={h}
          isPending={false}
          commands={uiState.slashCommands}
        />
      ))}
      {uiState.pendingHistoryItems.map((item, i) => (
        <HistoryItemDisplay
          key={i}
          availableTerminalHeight={undefined}
          terminalWidth={uiState.mainAreaWidth}
          item={{ ...item, id: 0 }}
          isPending={true}
          isFocused={false}
          activeShellPtyId={uiState.activePtyId}
          embeddedShellFocused={uiState.embeddedShellFocused}
        />
      ))}
      <QuittingDisplay />
    </Box>
  );
};
