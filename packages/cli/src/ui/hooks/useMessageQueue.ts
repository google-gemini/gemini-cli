/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { StreamingState } from '../types.js';
import { debugLogger } from '@google/gemini-cli-core';

export interface UseMessageQueueOptions {
  isConfigInitialized: boolean;
  streamingState: StreamingState;
  submitQuery: (query: string) => void;
  isMcpReady: boolean;
}

export interface UseMessageQueueReturn {
  messageQueue: string[];
  addMessage: (message: string) => void;
  clearQueue: () => void;
  getQueuedMessagesText: () => string;
  popAllMessages: () => string | undefined;
}

/**
 * Hook for managing message queuing during streaming responses.
 * Allows users to queue messages while the AI is responding and automatically
 * sends them when streaming completes.
 */
export function useMessageQueue({
  isConfigInitialized,
  streamingState,
  submitQuery,
  isMcpReady,
}: UseMessageQueueOptions): UseMessageQueueReturn {
  const [messageQueue, setMessageQueue] = useState<string[]>([]);

  // Add a message to the queue
  const addMessage = useCallback((message: string) => {
    const trimmedMessage = message.trim();
    if (trimmedMessage.length > 0) {
      debugLogger.log(`useMessageQueue: adding message to queue: ${trimmedMessage.substring(0, 50)}...`);
      setMessageQueue((prev) => [...prev, trimmedMessage]);
    } else {
      debugLogger.log('useMessageQueue: ignored empty message');
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

  // Pop all messages from the queue and return them as a single string
  const popAllMessages = useCallback(() => {
    if (messageQueue.length === 0) {
      return undefined;
    }
    const allMessages = messageQueue.join('\n\n');
    setMessageQueue([]);
    return allMessages;
  }, [messageQueue]);

  // Process queued messages when streaming becomes idle
  useEffect(() => {
    debugLogger.log(`useMessageQueue effect trigger: config=${isConfigInitialized}, state=${streamingState}, mcpReady=${isMcpReady}, queueLen=${messageQueue.length}`);
    if (
      isConfigInitialized &&
      streamingState === StreamingState.Idle &&
      isMcpReady &&
      messageQueue.length > 0
    ) {
      debugLogger.log('useMessageQueue: submitting queued message!');
      // Combine all messages with double newlines for clarity
      const combinedMessage = messageQueue.join('\n\n');
      // Clear the queue and submit
      setMessageQueue([]);
      submitQuery(combinedMessage);
    }
  }, [
    isConfigInitialized,
    streamingState,
    isMcpReady,
    messageQueue,
    submitQuery,
  ]);

  return {
    messageQueue,
    addMessage,
    clearQueue,
    getQueuedMessagesText,
    popAllMessages,
  };
}
