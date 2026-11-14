/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { isFileDiff } from '@google/gemini-cli-core';
import type { HistoryItem, IndividualToolCallDisplay } from '../types.js';

/**
 * Budget, in characters of history content, for the history that the inline
 * `<Static>` renderer re-prints when it is remounted after a terminal width
 * change.
 *
 * Only the amount of re-printed history is bounded: message content is never
 * altered, and at least one screen of the newest history is always re-printed
 * so that everything visible before the refresh is redrawn. Older items are
 * not lost; they remain in the terminal's native scrollback.
 */
export const RESIZE_REFRESH_MAX_HISTORY_CHARS = 1000;

/** Characters assumed for items whose content is not plain text. */
const NON_TEXT_ITEM_CHARS = 500;

function countToolResultChars(
  resultDisplay: IndividualToolCallDisplay['resultDisplay'],
  limit: number,
): number {
  // Resumed sessions restore `resultDisplay` from JSON without validating it,
  // so check the shape at runtime: values without output count as empty, and
  // `in` is never applied to a primitive or `null`.
  if (!resultDisplay) {
    return 0;
  }
  if (typeof resultDisplay === 'string') {
    return resultDisplay.length;
  }
  if (Array.isArray(resultDisplay)) {
    let chars = 0;
    for (const line of resultDisplay) {
      if (Array.isArray(line)) {
        for (const token of line) {
          if (
            token &&
            typeof token === 'object' &&
            'text' in token &&
            typeof token.text === 'string'
          ) {
            chars += Array.from(token.text).length;
          } else if (typeof token === 'string') {
            chars += Array.from(token).length;
          }
          if (chars >= limit) {
            break;
          }
        }
      } else if (typeof line === 'string') {
        chars += Array.from(line).length;
      }
      if (chars >= limit) {
        break;
      }
    }
    return chars;
  }
  if (isFileDiff(resultDisplay)) {
    return resultDisplay.fileDiff.length;
  }
  return NON_TEXT_ITEM_CHARS;
}

/**
 * Returns the number of content characters that `item` prints: its text, or
 * the descriptions and textual output of its tool calls. Items without plain
 * text content count as a fixed size. Counting stops once `limit` is reached
 * so that large tool output is not scanned in full.
 */
export function countHistoryItemChars(
  item: HistoryItem,
  limit = Number.POSITIVE_INFINITY,
): number {
  let chars: number;
  if (item.type === 'tool_group') {
    chars = 0;
    const tools = item.tools ?? [];
    for (const tool of tools) {
      if (chars >= limit) {
        break;
      }
      chars +=
        Array.from(tool.description ?? '').length +
        countToolResultChars(tool.resultDisplay, limit - chars);
    }
  } else if (typeof item.text === 'string') {
    chars = item.text.length;
  } else {
    chars = NON_TEXT_ITEM_CHARS;
  }
  return Math.min(chars, limit);
}

/**
 * Returns a conservative estimate of the number of terminal rows that `item`
 * occupies when printed at `width` columns: every non-empty text line counts
 * one row per `width` characters and every tool call counts one row, while
 * blank lines, margins, borders, and tool output are not counted. Erring low
 * keeps a window measured with it at least one screen tall. Counting stops
 * once `limit` is reached.
 */
export function countHistoryItemMinRows(
  item: HistoryItem,
  width: number,
  limit = Number.POSITIVE_INFINITY,
): number {
  let rows: number;
  if (item.type === 'tool_group') {
    rows = item.tools?.length ?? 0;
  } else if (typeof item.text === 'string') {
    const columns = Math.max(1, width);
    rows = 0;
    let lineStart = 0;
    while (rows < limit) {
      const newlineIndex = item.text.indexOf('\n', lineStart);
      const lineEnd = newlineIndex === -1 ? item.text.length : newlineIndex;
      rows += Math.ceil((lineEnd - lineStart) / columns);
      if (newlineIndex === -1) {
        break;
      }
      lineStart = newlineIndex + 1;
    }
  } else {
    rows = 1;
  }
  return Math.min(rows, limit);
}

/**
 * Returns the index of the first history item that a resize refresh
 * re-prints.
 *
 * Items are accumulated from the newest backwards. An older item is included
 * while it fits in the `maxChars` budget or while the window is still shorter
 * than `minRows` rows, so the window always covers at least one screen. The
 * newest item is always included and no item is truncated.
 */
export function getResizeRefreshHistoryStartIndex(
  history: readonly HistoryItem[],
  {
    width,
    minRows,
    maxChars = RESIZE_REFRESH_MAX_HISTORY_CHARS,
  }: { width: number; minRows: number; maxChars?: number },
): number {
  let chars = 0;
  let rows = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    if (chars <= maxChars) {
      chars += countHistoryItemChars(item, maxChars - chars + 1);
    }
    if (i < history.length - 1 && chars > maxChars && rows >= minRows) {
      return i + 1;
    }
    if (rows < minRows) {
      rows += countHistoryItemMinRows(item, width, minRows - rows);
    }
  }
  return 0;
}

/**
 * Returns true when `next` only appended items to `previous`.
 *
 * Appending through `addItem` keeps existing item references and ids in place,
 * whereas replacing or resuming a session creates a new list (often with
 * sequential ids starting at 1).
 */
function isAppendOnlyContinuation(
  previous: readonly HistoryItem[],
  next: readonly HistoryItem[],
): boolean {
  if (previous.length === 0 || next.length < previous.length) {
    return false;
  }
  for (let i = 0; i < previous.length; i++) {
    if (next[i] !== previous[i] || next[i].id !== previous[i].id) {
      return false;
    }
  }
  return true;
}

interface StaticHistoryWindow {
  historyRemountKey: number;
  terminalWidth: number;
  startIndex: number;
  /**
   * Whether the terminal width differed from `terminalWidth` at any render
   * since this window was selected. A resize can end at the previous width
   * (for example, a quick drag out and back), and the refresh that follows
   * still re-prints history that the terminal re-wrapped in between.
   */
  widthChanged: boolean;
}

/**
 * Returns the index of the first history item that the inline `<Static>`
 * renderer prints for the current `historyRemountKey`.
 *
 * `<Static>` only prints items beyond the count it has already printed, so the
 * start index stays fixed until `historyRemountKey` changes. A window is used
 * only when the terminal width changed at any point since the previous remount
 * (even if it returned to the same value) and the history is an append-only
 * continuation of what was already printed. The window covers at least one
 * screen of the newest history, so everything visible before the refresh is
 * redrawn and every omitted item had already scrolled into the terminal
 * scrollback. Any other remount (theme or Markdown changes, `/clear`, session
 * resume, and so on) prints the full history.
 */
export function useStaticHistoryStartIndex({
  history,
  historyRemountKey,
  terminalWidth,
  terminalHeight,
  contentWidth,
  enabled,
}: {
  history: readonly HistoryItem[];
  historyRemountKey: number;
  terminalWidth: number;
  terminalHeight: number;
  contentWidth: number;
  enabled: boolean;
}): number {
  // History as of the last commit, which is what <Static> has printed so far.
  const printedHistoryRef = useRef(history);
  useLayoutEffect(() => {
    printedHistoryRef.current = history;
  }, [history]);

  const [staticWindow, setStaticWindow] = useState<StaticHistoryWindow>(() => ({
    historyRemountKey,
    terminalWidth,
    startIndex: 0,
    widthChanged: false,
  }));

  if (staticWindow.historyRemountKey === historyRemountKey) {
    if (
      !staticWindow.widthChanged &&
      staticWindow.terminalWidth !== terminalWidth
    ) {
      // Remember the width change until the next remount, even if the width
      // returns to its previous value before the refresh.
      setStaticWindow({ ...staticWindow, widthChanged: true });
    }
    return staticWindow.startIndex;
  }

  const isResizeRemount =
    enabled &&
    (staticWindow.widthChanged ||
      staticWindow.terminalWidth !== terminalWidth) &&
    isAppendOnlyContinuation(printedHistoryRef.current, history);
  const startIndex = isResizeRemount
    ? getResizeRefreshHistoryStartIndex(history, {
        width: contentWidth,
        minRows: terminalHeight,
      })
    : 0;
  // Adjusting state during render lets the remounted <Static> use the new
  // window in the same commit, without an intermediate full-history frame.
  setStaticWindow({
    historyRemountKey,
    terminalWidth,
    startIndex,
    widthChanged: false,
  });
  return startIndex;
}
