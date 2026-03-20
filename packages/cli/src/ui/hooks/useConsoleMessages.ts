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
  startTransition,
} from 'react';
import type { ConsoleMessageItem } from '../types.js';
import {
  coreEvents,
  CoreEvent,
  type ConsoleLogPayload,
} from '@google/gemini-cli-core';

export interface UseConsoleMessagesReturn {
  consoleMessages: ConsoleMessageItem[];
  clearConsoleMessages: () => void;
}

type Action =
  | { type: 'ADD_MESSAGES'; payload: ConsoleMessageItem[] }
  | { type: 'CLEAR' };

function consoleMessagesReducer(
  state: ConsoleMessageItem[],
  action: Action,
): ConsoleMessageItem[] {
  const MAX_CONSOLE_MESSAGES = 1000;
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

      // Limit the number of messages to prevent memory issues
      if (newMessages.length > MAX_CONSOLE_MESSAGES) {
        return newMessages.slice(newMessages.length - MAX_CONSOLE_MESSAGES);
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
  const isProcessingRef = useRef(false);

  const processQueue = useCallback(() => {
    if (messageQueueRef.current.length > 0) {
      isProcessingRef.current = true;
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
      if (!isProcessingRef.current && !timeoutRef.current) {
        // Batch updates using a timeout. 50ms is a reasonable delay to batch
        // rapid-fire messages without noticeable lag while avoiding React update
        // queue flooding.
        timeoutRef.current = setTimeout(processQueue, 50);
      }
    },
    [processQueue],
  );

  // Once the updated consoleMessages have been committed to the screen,
  // we can safely process the next batch of queued messages if any exist.
  // This completely eliminates overlapping concurrent updates to this state.
  useEffect(() => {
    isProcessingRef.current = false;
    if (messageQueueRef.current.length > 0 && !timeoutRef.current) {
      timeoutRef.current = setTimeout(processQueue, 50);
    }
  }, [consoleMessages, processQueue]);

  useEffect(() => {
    const handleConsoleLog = (payload: ConsoleLogPayload) => {
      let content = payload.content;
      const MAX_CONSOLE_MSG_LENGTH = 10000;
      if (content.length > MAX_CONSOLE_MSG_LENGTH) {
        content =
          content.slice(0, MAX_CONSOLE_MSG_LENGTH) +
          `... [Truncated ${content.length - MAX_CONSOLE_MSG_LENGTH} characters]`;
      }

      handleNewMessage({
        type: payload.type,
        content,
        count: 1,
      });
    };

    const handleOutput = (payload: {
      isStderr: boolean;
      chunk: Uint8Array | string;
    }) => {
      let content =
        typeof payload.chunk === 'string'
          ? payload.chunk
          : new TextDecoder().decode(payload.chunk);

      const MAX_OUTPUT_CHUNK_LENGTH = 10000;
      if (content.length > MAX_OUTPUT_CHUNK_LENGTH) {
        content =
          content.slice(0, MAX_OUTPUT_CHUNK_LENGTH) +
          `... [Truncated ${content.length - MAX_OUTPUT_CHUNK_LENGTH} characters]`;
      }

      // It would be nice if we could show stderr as 'warn' but unfortunately
      // we log non warning info to stderr before the app starts so that would
      // be misleading.
      handleNewMessage({ type: 'log', content, count: 1 });
    };

    coreEvents.on(CoreEvent.ConsoleLog, handleConsoleLog);
    coreEvents.on(CoreEvent.Output, handleOutput);
    return () => {
      coreEvents.off(CoreEvent.ConsoleLog, handleConsoleLog);
      coreEvents.off(CoreEvent.Output, handleOutput);
    };
  }, [handleNewMessage]);

  const clearConsoleMessages = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    messageQueueRef.current = [];
    isProcessingRef.current = true;
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

  return { consoleMessages, clearConsoleMessages };
}
