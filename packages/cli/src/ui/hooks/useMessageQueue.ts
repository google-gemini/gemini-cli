/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { StreamingState } from '../types.js';

export interface UseMessageQueueOptions {
  streamingState: StreamingState;
  submitQuery: (query: string) => void;
  messageQueueMode: 'wait_for_idle' | 'wait_for_response';
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

  // Process queued messages when streaming becomes idle
  useEffect(() => {
    const isIdle = streamingState === StreamingState.Idle;
    const isWaiting = streamingState === StreamingState.WaitingForConfirmation;

    const shouldSubmit =
      (messageQueueMode === 'wait_for_idle' && isIdle) ||
      (messageQueueMode === 'wait_for_response' && (isIdle || isWaiting));

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
