/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import { useUIState } from '../contexts/UIStateContext.js';
import {
  ToolCallStatus,
  type IndividualToolCallDisplay,
  type HistoryItemToolGroup,
} from '../types.js';

export interface ConfirmingToolState {
  tool: IndividualToolCallDisplay;
  index: number;
  total: number;
}

/**
 * Selects the "Head" of the confirmation queue.
 * Returns the first tool in the pending state that requires confirmation.
 */
export function useConfirmingTool(): ConfirmingToolState | null {
  // We use pendingHistoryItems to ensure we capture tools from both
  // Gemini responses and Slash commands.
  const { pendingHistoryItems } = useUIState();

  return useMemo(() => {
    // 1. Flatten all pending tools from all pending history groups
    const allPendingTools = pendingHistoryItems
      .filter(
        (item): item is HistoryItemToolGroup => item.type === 'tool_group',
      )
      .flatMap((group) => group.tools);

    // 2. Filter for those requiring confirmation
    const confirmingTools = allPendingTools.filter(
      (t) => t.status === ToolCallStatus.Confirming,
    );

    if (confirmingTools.length === 0) {
      return null;
    }

    // 3. Select Head (FIFO)
    const head = confirmingTools[0];

    // 4. Calculate progress based on the full tool list
    // This gives the user context of where they are in the current batch.
    const headIndexInFullList = allPendingTools.findIndex(
      (t) => t.callId === head.callId,
    );

    return {
      tool: head,
      index: headIndexInFullList + 1,
      total: allPendingTools.length,
    };
  }, [pendingHistoryItems]);
}
