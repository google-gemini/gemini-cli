/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreToolCallStatus } from '@google/gemini-cli-core';
import {
  type HistoryItemWithoutId,
  type IndividualToolCallDisplay,
} from '../types.js';
import { getAllToolCalls } from './historyUtils.js';

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
  const allPendingTools = getAllToolCalls(pendingHistoryItems);

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
