/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreToolCallStatus } from '@google/gemini-cli-core';
import { isShellTool } from '../components/messages/ToolShared.js';
import { theme } from '../semantic-colors.js';
import type {
  HistoryItem,
  HistoryItemWithoutId,
  HistoryItemToolGroup,
  IndividualToolCallDisplay,
} from '../types.js';
import type { BackgroundShell } from '../hooks/shellReducer.js';
import type { TrackedToolCall } from '../hooks/useToolScheduler.js';

function isTrackedToolCall(
  tool: IndividualToolCallDisplay | TrackedToolCall,
): tool is TrackedToolCall {
  return 'request' in tool;
}

/**
 * Calculates the border color and dimming state for a tool group message.
 */
export function getToolGroupBorderAppearance(
  item:
    | HistoryItem
    | HistoryItemWithoutId
    | { type: 'tool_group'; tools: TrackedToolCall[] },
  activeShellPtyId: number | null | undefined,
  embeddedShellFocused: boolean | undefined,
  allPendingItems: HistoryItemWithoutId[] = [],
  backgroundShells: Map<number, BackgroundShell> = new Map(),
): { borderColor: string; borderDimColor: boolean } {
  if (item.type !== 'tool_group') {
    return { borderColor: '', borderDimColor: false };
  }

  // If this item has no tools, it's a closing slice for the current batch.
  // We need to look at the last pending item to determine the batch's appearance.
  const toolsToInspect: Array<IndividualToolCallDisplay | TrackedToolCall> =
    item.tools.length > 0
      ? item.tools
      : allPendingItems
          .filter(
            (i): i is HistoryItemToolGroup =>
              i !== null && i !== undefined && i.type === 'tool_group',
          )
          .slice(-1)
          .flatMap((i) => i.tools);

  const hasPending = toolsToInspect.some((t) => {
    if (isTrackedToolCall(t)) {
      return (
        t.status !== 'success' &&
        t.status !== 'error' &&
        t.status !== 'cancelled'
      );
    } else {
      return (
        t.status !== CoreToolCallStatus.Success &&
        t.status !== CoreToolCallStatus.Error &&
        t.status !== CoreToolCallStatus.Cancelled
      );
    }
  });

  const isEmbeddedShellFocused = toolsToInspect.some((t) => {
    if (isTrackedToolCall(t)) {
      return (
        isShellTool(t.request.name) &&
        t.status === 'executing' &&
        t.pid === activeShellPtyId &&
        !!embeddedShellFocused
      );
    } else {
      return (
        isShellTool(t.name) &&
        t.status === CoreToolCallStatus.Executing &&
        t.ptyId === activeShellPtyId &&
        !!embeddedShellFocused
      );
    }
  });

  const isShellCommand = toolsToInspect.some((t) => {
    if (isTrackedToolCall(t)) {
      return isShellTool(t.request.name);
    } else {
      return isShellTool(t.name);
    }
  });

  // If we have an active PTY that isn't a background shell, then the current
  // pending batch is definitely a shell batch.
  const isCurrentlyInShellTurn =
    !!activeShellPtyId && !backgroundShells.has(activeShellPtyId);

  const isShell =
    isShellCommand || (item.tools.length === 0 && isCurrentlyInShellTurn);
  const isPending =
    hasPending || (item.tools.length === 0 && isCurrentlyInShellTurn);

  const isEffectivelyFocused =
    isEmbeddedShellFocused ||
    (item.tools.length === 0 &&
      isCurrentlyInShellTurn &&
      !!embeddedShellFocused);

  const borderColor =
    (isShell && isPending) || isEffectivelyFocused
      ? theme.ui.symbol
      : isPending
        ? theme.status.warning
        : theme.border.default;

  const borderDimColor = isPending && (!isShell || !isEffectivelyFocused);

  return { borderColor, borderDimColor };
}
