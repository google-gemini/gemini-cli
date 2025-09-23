/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import type { HistoryItem } from '../types.js';
import type { SlashCommand } from '../commands/types.js';

interface HistoryListProps {
  history: HistoryItem[];
  terminalWidth: number;
  staticAreaMaxItemHeight: number;
  slashCommands: readonly SlashCommand[];
}

export const HistoryList = ({
  history,
  terminalWidth,
  staticAreaMaxItemHeight,
  slashCommands,
}: HistoryListProps) => (
  <>
    {history.map((h) => (
      <HistoryItemDisplay
        terminalWidth={terminalWidth}
        availableTerminalHeight={staticAreaMaxItemHeight}
        key={h.id}
        item={h}
        isPending={false}
        commands={slashCommands}
      />
    ))}
  </>
);
