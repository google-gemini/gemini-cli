/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { getInlineThinkingMode } from '../utils/inlineThinkingMode.js';

export const QuittingDisplay = () => {
  const uiState = useUIState();
  const settings = useSettings();
  const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();

  const availableTerminalHeight = terminalHeight;
  const inlineThinkingMode = getInlineThinkingMode(settings);

  if (!uiState.quittingMessages) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {uiState.quittingMessages.map((item) => (
        <HistoryItemDisplay
          key={item.id}
          availableTerminalHeight={
            uiState.constrainHeight ? availableTerminalHeight : undefined
          }
          terminalWidth={terminalWidth}
          item={item}
          isPending={false}
          inlineThinkingMode={inlineThinkingMode}
        />
      ))}
    </Box>
  );
};
