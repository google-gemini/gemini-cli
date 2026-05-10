/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import {
  isFunctionCall,
  isFunctionResponse,
} from '../../utils/messageInspectors.js';

// The maximum number of recent history turns to scan before filtering.
export const HISTORY_SEARCH_WINDOW = 20;

/**
 * Returns a cleaned slice of conversation history for routing classifiers.
 * It strips out all tool-related turns to guarantee the context is text-only,
 * avoiding backend validation failures on orphaned calls/responses, and takes
 * exactly the last `maxTurns` turns.
 *
 * IMPORTANT: If we ever want to change this to include tool-related turns,
 * we need to be extremely careful to ensure that they are not the very first
 * parts in the history we send in the classifier request, as the backend explicitly
 * rejects payloads where `contents[0]` is a function call or response.
 */
export function getCleanHistorySlice(
  history: readonly Content[],
  maxTurns: number,
): Content[] {
  const historySlice = history.slice(-HISTORY_SEARCH_WINDOW);
  const cleanHistory = historySlice.filter(
    (content) => !isFunctionCall(content) && !isFunctionResponse(content),
  );
  return cleanHistory.slice(-maxTurns);
}
