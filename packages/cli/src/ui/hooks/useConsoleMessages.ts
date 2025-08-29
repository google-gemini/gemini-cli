/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useTransition,
} from 'react';
import type { ConsoleMessageItem } from '../types.js';

export interface UseConsoleMessagesReturn {
  consoleMessages: ConsoleMessageItem[];
  handleNewMessage: (message: ConsoleMessageItem) => void;
  clearConsoleMessages: () => void;
}

type Action =
  | { type: 'ADD_MESSAGES'; payload: ConsoleMessageItem[] }
  | { type: 'CLEAR' };

function consoleMessagesReducer(
  state: ConsoleMessageItem[],
  action: Action,
): ConsoleMessageItem[] {
  switch (action.type) {
    case 'ADD_MESSAGES': {
      const newMessages = [...state];
      for (const queuedMessage of action.payload) {
        const lastMessage = newMessages[newMessages.length - 1];
        if (
          lastMessage &&
          lastMessage.type === queuedMessage.type &&
          lastMessage.content === queuedMessage.content
        ) {
          // Create a new object for the last message to ensure React detects
          // the change, preventing mutation of the existing state object.
          newMessages[newMessages.length - 1] = {
            ...lastMessage,
            count: lastMessage.count + 1,
          };
        } else {
          newMessages.push({ ...queuedMessage, count: 1 });
        }
      }
      return newMessages;
    }
    case 'CLEAR':
      return [];
    default:
      return state;
  }
}

export function useConsoleMessages(): UseConsoleMessagesReturn {
  const [consoleMessages, dispatch] = useReducer(consoleMessagesReducer, []);
  const messageQueueRef = useRef<ConsoleMessageItem[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [, startTransition] = useTransition();

  const processQueue = useCallback(() => {
    if (messageQueueRef.current.length > 0) {
      const messagesToProcess = messageQueueRef.current;
      messageQueueRef.current = [];
      startTransition(() => {
        dispatch({ type: 'ADD_MESSAGES', payload: messagesToProcess });
      });
    }
    timeoutRef.current = null;
  }, []);

  const handleNewMessage = useCallback(
    (message: ConsoleMessageItem) => {
      messageQueueRef.current.push(message);
      if (!timeoutRef.current) {
        // Batch updates using a timeout. 16ms is a reasonable delay to batch
        // rapid-fire messages without noticeable lag.
        timeoutRef.current = setTimeout(processQueue, 16);
      }
    },
    [processQueue],
  );

  const clearConsoleMessages = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    messageQueueRef.current = [];
    startTransition(() => {
      dispatch({ type: 'CLEAR' });
    });
  }, []);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  return { consoleMessages, handleNewMessage, clearConsoleMessages };
}
