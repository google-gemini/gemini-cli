/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreToolCallStatus } from '@google/gemini-cli-core';
import {
  type HistoryItemToolGroup,
  type HistoryItemWithoutId,
  type IndividualToolCallDisplay,
} from '../types.js';

export interface ConfirmingToolState {
  tool: IndividualToolCallDisplay;
  index: number;
  total: number;
}

/**
 * Selects the "head" of the confirmation queue.
 */
export function getConfirmingToolState(
  pendingHistoryItems: HistoryItemWithoutId[],
): ConfirmingToolState | null {
  const allPendingTools = pendingHistoryItems
    .filter((item): item is HistoryItemToolGroup => item.type === 'tool_group')
    .flatMap((group) => group.tools);

  const confirmingTools = allPendingTools.filter(
    (tool) => tool.status === CoreToolCallStatus.AwaitingApproval,
  );

  if (confirmingTools.length === 0) {
    return null;
  }

  const head = confirmingTools[0];
  const headIndexInFullList = allPendingTools.findIndex(
    (tool) => tool.callId === head.callId,
  );

  return {
    tool: head,
    index: headIndexInFullList + 1,
    total: allPendingTools.length,
  };
}
