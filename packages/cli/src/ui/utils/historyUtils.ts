/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreToolCallStatus } from '../types.js';
import type {
  HistoryItem,
  HistoryItemWithoutId,
  HistoryItemToolGroup,
  IndividualToolCallDisplay,
} from '../types.js';

export function getLastTurnToolCallIds(
  history: HistoryItem[],
  pendingHistoryItems: HistoryItemWithoutId[],
): string[] {
  const targetToolCallIds: string[] = [];

  // Find the boundary of the last user prompt
  let lastUserPromptIndex = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    const type = history[i].type;
    if (type === 'user' || type === 'user_shell') {
      lastUserPromptIndex = i;
      break;
    }
  }

  // Collect IDs from history after last user prompt
  history.forEach((item, index) => {
    if (index > lastUserPromptIndex && item.type === 'tool_group') {
      item.tools.forEach((t) => {
        if (t.callId) targetToolCallIds.push(t.callId);
      });
    }
  });

  // Collect IDs from pending items
  pendingHistoryItems.forEach((item) => {
    if (item.type === 'tool_group') {
      item.tools.forEach((t) => {
        if (t.callId) targetToolCallIds.push(t.callId);
      });
    }
  });

  return targetToolCallIds;
}

export function isToolExecuting(
  pendingHistoryItems: HistoryItemWithoutId[],
): boolean {
  return pendingHistoryItems.some((item) => {
    if (item && item.type === 'tool_group') {
      return item.tools.some(
        (tool) => CoreToolCallStatus.Executing === tool.status,
      );
    }
    return false;
  });
}

export function isToolAwaitingConfirmation(
  pendingHistoryItems: HistoryItemWithoutId[],
): boolean {
  return pendingHistoryItems
    .filter((item): item is HistoryItemToolGroup => item.type === 'tool_group')
    .some((item) =>
      item.tools.some(
        (tool) => CoreToolCallStatus.AwaitingApproval === tool.status,
      ),
    );
}

export function getAllToolCalls(
  historyItems: HistoryItemWithoutId[],
): IndividualToolCallDisplay[] {
  return historyItems
    .filter((item): item is HistoryItemToolGroup => item.type === 'tool_group')
    .flatMap((group) => group.tools);
}
