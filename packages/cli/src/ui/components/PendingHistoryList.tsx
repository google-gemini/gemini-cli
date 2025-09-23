/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import type { HistoryItemWithoutId } from '../types.js';

interface PendingHistoryListProps {
  pendingHistoryItems: HistoryItemWithoutId[];
  terminalWidth: number;
  availableTerminalHeight?: number;
  constrainHeight?: boolean;
  isEditorDialogOpen: boolean;
  activePtyId?: string;
  embeddedShellFocused?: boolean;
}

export const PendingHistoryList = ({
  pendingHistoryItems,
  terminalWidth,
  availableTerminalHeight,
  constrainHeight,
  isEditorDialogOpen,
  activePtyId,
  embeddedShellFocused,
}: PendingHistoryListProps) => (
  <>
    {pendingHistoryItems.map((item, i) => (
      <HistoryItemDisplay
        key={i}
        availableTerminalHeight={
          constrainHeight ? availableTerminalHeight : undefined
        }
        terminalWidth={terminalWidth}
        item={{ ...item, id: 0 }}
        isPending={true}
        isFocused={!isEditorDialogOpen}
        activeShellPtyId={activePtyId ? parseInt(activePtyId, 10) : null}
        embeddedShellFocused={embeddedShellFocused}
      />
    ))}
  </>
);
