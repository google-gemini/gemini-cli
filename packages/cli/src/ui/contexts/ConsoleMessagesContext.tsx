/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useCallback,
  startTransition,
  type ReactNode,
} from 'react';
import type { ConsoleMessageItem } from '../types.js';
import {
  coreEvents,
  CoreEvent,
  type ConsoleLogPayload,
} from '@google/gemini-cli-core';

export interface ConsoleMessagesContextValue {
  consoleMessages: ConsoleMessageItem[];
  errorCount: number;
  clearConsoleMessages: () => void;
  clearErrorCount: () => void;
}

const ConsoleMessagesContext = createContext<
  ConsoleMessagesContextValue | undefined
>(undefined);

type Action =
  | { type: 'ADD_MESSAGES'; payload: ConsoleMessageItem[] }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'CLEAR_ERROR_COUNT' };

interface State {
  consoleMessages: ConsoleMessageItem[];
  errorCount: number;
}

function reducer(state: State, action: Action): State {
  const MAX_CONSOLE_MESSAGES = 1000;
  switch (action.type) {
    case 'ADD_MESSAGES': {
      const newMessages = [...state.consoleMessages];
      let newErrorCount = state.errorCount;

      for (const queuedMessage of action.payload) {
        if (queuedMessage.type === 'error') {
          newErrorCount++;
        }

        const lastMessage = newMessages[newMessages.length - 1];
        if (
          lastMessage &&
          lastMessage.type === queuedMessage.type &&
          lastMessage.content === queuedMessage.content
        ) {
          newMessages[newMessages.length - 1] = {
            ...lastMessage,
            count: (lastMessage.count || 1) + 1,
          };
        } else {
          newMessages.push({ ...queuedMessage, count: 1 });
        }
      }

      const finalMessages =
        newMessages.length > MAX_CONSOLE_MESSAGES
          ? newMessages.slice(newMessages.length - MAX_CONSOLE_MESSAGES)
          : newMessages;

      return {
        ...state,
        consoleMessages: finalMessages,
        errorCount: newErrorCount,
      };
    }
    case 'CLEAR_MESSAGES':
      return { ...state, consoleMessages: [] };
    case 'CLEAR_ERROR_COUNT':
      return { ...state, errorCount: 0 };
    default:
      return state;
  }
}

export const ConsoleMessagesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(reducer, {
    consoleMessages: [],
    errorCount: 0,
  });

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
        timeoutRef.current = setTimeout(processQueue, 50);
      }
    },
    [processQueue],
  );

  useEffect(() => {
    isProcessingRef.current = false;
    if (messageQueueRef.current.length > 0 && !timeoutRef.current) {
      timeoutRef.current = setTimeout(processQueue, 50);
    }
  }, [state.consoleMessages, processQueue]);

  useEffect(() => {
    const handleConsoleLog = (payload: ConsoleLogPayload) => {
      let content = payload.content;
      const MAX_CONSOLE_MSG_LENGTH = 10000;
      if (content.length > MAX_CONSOLE_MSG_LENGTH) {
        content =
          content.slice(0, MAX_CONSOLE_MSG_LENGTH) +
          `... [Truncated ${
            content.length - MAX_CONSOLE_MSG_LENGTH
          } characters]`;
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
          `... [Truncated ${
            content.length - MAX_OUTPUT_CHUNK_LENGTH
          } characters]`;
      }

      handleNewMessage({ type: 'log', content, count: 1 });
    };

    coreEvents.on(CoreEvent.ConsoleLog, handleConsoleLog);
    coreEvents.on(CoreEvent.Output, handleOutput);

    // Drain existing backlogs upon mounting the provider
    coreEvents.drainBacklogs();

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
      dispatch({ type: 'CLEAR_MESSAGES' });
    });
  }, []);

  const clearErrorCount = useCallback(() => {
    startTransition(() => {
      dispatch({ type: 'CLEAR_ERROR_COUNT' });
    });
  }, []);

  return (
    <ConsoleMessagesContext.Provider
      value={{
        consoleMessages: state.consoleMessages,
        errorCount: state.errorCount,
        clearConsoleMessages,
        clearErrorCount,
      }}
    >
      {children}
    </ConsoleMessagesContext.Provider>
  );
};

export const useConsoleMessagesContext = () => {
  const context = useContext(ConsoleMessagesContext);
  if (!context) {
    throw new Error(
      'useConsoleMessagesContext must be used within a ConsoleMessagesProvider',
    );
  }
  return context;
};
