/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { StreamingState } from '../types.js';
import type { MessageQueueMode } from '@google/gemini-cli-core';
import { MESSAGE_QUEUE_MODES } from '@google/gemini-cli-core';

export interface UseMessageQueueOptions {
  streamingState: StreamingState;
  submitQuery: (query: string) => void;
  messageQueueMode: MessageQueueMode;
}

export interface UseMessageQueueReturn {
  messageQueue: string[];
  addMessage: (message: string) => void;
  clearQueue: () => void;
  getQueuedMessagesText: () => string;
}

/**
 * Hook for managing message queuing during streaming responses.
 * Allows users to queue messages while the AI is responding and automatically
 * sends them when streaming completes.
 */
export function useMessageQueue({
  streamingState,
  submitQuery,
  messageQueueMode,
}: UseMessageQueueOptions): UseMessageQueueReturn {
  const [messageQueue, setMessageQueue] = useState<string[]>([]);

  // Add a message to the queue
  const addMessage = useCallback((message: string) => {
    const trimmedMessage = message.trim();
    if (trimmedMessage.length > 0) {
      setMessageQueue((prev) => [...prev, trimmedMessage]);
    }
  }, []);

  // Clear the entire queue
  const clearQueue = useCallback(() => {
    setMessageQueue([]);
  }, []);

  // Get all queued messages as a single text string
  const getQueuedMessagesText = useCallback(() => {
    if (messageQueue.length === 0) return '';
    return messageQueue.join('\n\n');
  }, [messageQueue]);

  // Process queued messages based on mode
  useEffect(() => {
    const isIdle = streamingState === StreamingState.Idle;
    const isResponseComplete =
      streamingState === StreamingState.ResponseComplete;
    const isWaiting = streamingState === StreamingState.WaitingForConfirmation;

    const shouldSubmit =
      (messageQueueMode === MESSAGE_QUEUE_MODES[0] && isIdle) ||
      (messageQueueMode === MESSAGE_QUEUE_MODES[1] &&
        (isResponseComplete || isWaiting || isIdle));

    if (shouldSubmit && messageQueue.length > 0) {
      // Combine all messages with double newlines for clarity
      const combinedMessage = messageQueue.join('\n\n');
      // Clear the queue and submit
      setMessageQueue([]);
      submitQuery(combinedMessage);
    }
  }, [streamingState, messageQueue, submitQuery, messageQueueMode]);

  return {
    messageQueue,
    addMessage,
    clearQueue,
    getQueuedMessagesText,
  };
}
