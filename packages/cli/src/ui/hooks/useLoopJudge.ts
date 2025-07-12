/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useEffect } from 'react';
import crypto from 'crypto';
import { HistoryItem, StreamingState } from '../types.js';

const LOOP_THRESHOLD = 5;

/**
 * A hook to detect and break potential loops of repetitive tool calls.
 *
 * This hook monitors the history of tool calls within a single turn. If it
 * detects the same tool call (based on its name, description, and result)
 * being repeated multiple times, it triggers a cancellation of the current
 * request to prevent infinite loops.
 *
 * @param history The full history of the conversation.
 * @param streamingState The current streaming state of the application.
 * @param cancelRequest A function to call to cancel the ongoing request.
 */
export const useLoopJudge = (
  history: HistoryItem[],
  streamingState: StreamingState,
  cancelRequest: (reason: string) => void,
) => {
  const toolCallCounts = useRef(new Map<string, number>());
  const lastHistoryLength = useRef(0);

  useEffect(() => {
    // Reset counts when a new turn starts (indicated by Idle state).
    if (streamingState === StreamingState.Idle) {
      toolCallCounts.current.clear();
      lastHistoryLength.current = 0;
      return;
    }

    // Only check for loops when actively receiving a response.
    if (streamingState !== StreamingState.Responding) {
      return;
    }

    // Only check if history has grown.
    if (history.length <= lastHistoryLength.current) {
      return;
    }

    lastHistoryLength.current = history.length;
    const lastItem = history[history.length - 1];
    if (lastItem.type !== 'tool_group') {
      return;
    }

    for (const toolCall of lastItem.tools) {
      // Create a unique signature for the tool call result.
      const signature = [
        toolCall.name,
        toolCall.description,
        JSON.stringify(toolCall.resultDisplay),
      ].join('-');

      // Hash to reduce length
      const hash = crypto.createHash('sha256').update(signature).digest('hex');

      const currentCount = toolCallCounts.current.get(hash) || 0;
      const newCount = currentCount + 1;
      toolCallCounts.current.set(hash, newCount);

      if (newCount >= LOOP_THRESHOLD) {
        cancelRequest(
          'A potential loop was detected due to repetitive tool calls. The request has been cancelled. Please try again with a more specific prompt.',
        );
        // Exit early since the request is now cancelled.
        return;
      }
    }
  }, [history, streamingState, cancelRequest]);
};
