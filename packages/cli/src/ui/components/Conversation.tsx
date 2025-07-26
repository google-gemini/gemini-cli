/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box } from 'ink';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { type HistoryItem } from '../types.js';
import { type Config } from '@google/gemini-cli-core';

interface ConversationProps {
  history: HistoryItem[];
  config: Config;
  terminalWidth: number;
}

export const Conversation = ({
  history,
  config,
  terminalWidth,
}: ConversationProps) => {
  const mainAreaWidth = Math.floor(terminalWidth * 0.9);

  return (
    <Box flexDirection="column" flexGrow={1} width="90%">
      {history.map((h) => (
        <HistoryItemDisplay
          terminalWidth={mainAreaWidth}
          key={h.id}
          item={h}
          isPending={false}
          config={config}
        />
      ))}
    </Box>
  );
};
