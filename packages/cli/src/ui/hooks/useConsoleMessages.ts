/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConsoleMessageItem } from '../types.js';

export interface UseConsoleMessagesReturn {
  consoleMessages: ConsoleMessageItem[];
  handleNewMessage: (message: ConsoleMessageItem) => void;
  clearConsoleMessages: () => void;
}

export function useConsoleMessages(): UseConsoleMessagesReturn {
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessageItem[]>(
    [],
  );
  const messageQueueRef = useRef<ConsoleMessageItem[]>([]);
  const messageQueueTimeoutRef = useRef<number | null>(null);

  const processMessageQueue = useCallback(() => {
    if (messageQueueRef.current.length === 0) {
      return;
    }

    const newMessagesToAdd = messageQueueRef.current;
    messageQueueRef.current = [];

    setConsoleMessages((prevMessages) => {
      const newMessages = [...prevMessages];
      newMessagesToAdd.forEach((queuedMessage) => {
        if (
          newMessages.length > 0 &&
          newMessages[newMessages.length - 1].type === queuedMessage.type &&
          newMessages[newMessages.length - 1].content === queuedMessage.content
        ) {
          newMessages[newMessages.length - 1].count =
            (newMessages[newMessages.length - 1].count || 1) + 1;
        } else {
          newMessages.push({ ...queuedMessage, count: 1 });
        }
      });
      return newMessages;
    });

    messageQueueTimeoutRef.current = null; // Allow next scheduling
  }, []);

  const scheduleQueueProcessing = useCallback(() => {
    if (messageQueueTimeoutRef.current === null) {
      messageQueueTimeoutRef.current = setTimeout(
        processMessageQueue,
        0,
      ) as unknown as number;
    }
  }, [processMessageQueue]);

  const handleNewMessage = useCallback(
    (message: ConsoleMessageItem) => {
      messageQueueRef.current.push(message);
      scheduleQueueProcessing();
    },
    [scheduleQueueProcessing],
  );

  const clearConsoleMessages = useCallback(() => {
    setConsoleMessages([]);
    if (messageQueueTimeoutRef.current !== null) {
      clearTimeout(messageQueueTimeoutRef.current);
      messageQueueTimeoutRef.current = null;
    }
    messageQueueRef.current = [];
  }, []);

  useEffect(
    () =>
      // Cleanup on unmount
      () => {
        if (messageQueueTimeoutRef.current !== null) {
          clearTimeout(messageQueueTimeoutRef.current);
        }
      },
    [],
  );

  return { consoleMessages, handleNewMessage, clearConsoleMessages };
}
