/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { ConsoleMessageItem } from '../types.js';
import {
  coreEvents,
  CoreEvent,
  type ConsoleLogPayload,
} from '@google/gemini-cli-core';

export interface UseErrorCountReturn {
  errorCount: number;
  clearErrorCount: () => void;
}

// --- Global Console Store ---

const MAX_CONSOLE_MESSAGES = 1000;
let globalConsoleMessages: ConsoleMessageItem[] = [];
let globalErrorCount = 0;
const listeners = new Set<() => void>();

let messageQueue: ConsoleMessageItem[] = [];
let timeoutId: NodeJS.Timeout | null = null;

/**
 * Initializes the global console store and subscribes to coreEvents.
 * Acts as a safe reset function, making it idempotent and useful for test isolation.
 * Must be called during application startup.
 */
export function initializeConsoleStore() {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  messageQueue = [];
  globalConsoleMessages = [];
  globalErrorCount = 0;
  notifyListeners();

  // Safely detach first to ensure idempotency and prevent listener leaks
  coreEvents.off(CoreEvent.ConsoleLog, handleConsoleLog);
  coreEvents.off(CoreEvent.Output, handleOutput);

  coreEvents.on(CoreEvent.ConsoleLog, handleConsoleLog);
  coreEvents.on(CoreEvent.Output, handleOutput);
}

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function processQueue() {
  if (messageQueue.length === 0) return;

  // Create a new array to trigger React updates
  const newMessages = [...globalConsoleMessages];

  for (const queuedMessage of messageQueue) {
    if (queuedMessage.type === 'error') {
      globalErrorCount++;
    }

    // Coalesce consecutive identical messages
    const prev = newMessages[newMessages.length - 1];
    if (
      prev &&
      prev.type === queuedMessage.type &&
      prev.content === queuedMessage.content
    ) {
      newMessages[newMessages.length - 1] = {
        ...prev,
        count: prev.count + 1,
      };
    } else {
      newMessages.push({ ...queuedMessage, count: 1 });
    }
  }

  globalConsoleMessages =
    newMessages.length > MAX_CONSOLE_MESSAGES
      ? newMessages.slice(-MAX_CONSOLE_MESSAGES)
      : newMessages;

  messageQueue = [];
  timeoutId = null;
  notifyListeners();
}

function handleNewMessage(message: ConsoleMessageItem) {
  messageQueue.push(message);
  if (!timeoutId) {
    // Batch updates using a timeout. 50ms is a reasonable delay to batch
    // rapid-fire messages without noticeable lag while avoiding React update
    // queue flooding.
    timeoutId = setTimeout(processQueue, 50);
  }
}

// --- Subscription API for useSyncExternalStore ---

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getConsoleMessagesSnapshot() {
  return globalConsoleMessages;
}

function getErrorCountSnapshot() {
  return globalErrorCount;
}

// --- Core Event Listeners (Always active at module level) ---

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

  handleNewMessage({ type: 'log', content, count: 1 });
};

/**
 * Hook to access the global console message history.
 * Decoupled from any component lifecycle to ensure history is preserved even
 * when the UI is unmounted.
 */
export function useConsoleMessages(): ConsoleMessageItem[] {
  return useSyncExternalStore(subscribe, getConsoleMessagesSnapshot);
}

/**
 * Hook to access the global error count.
 * Uses the same external store as useConsoleMessages for consistency.
 */
export function useErrorCount(): UseErrorCountReturn {
  const errorCount = useSyncExternalStore(subscribe, getErrorCountSnapshot);

  const clearErrorCount = useCallback(() => {
    globalErrorCount = 0;
    notifyListeners();
  }, []);

  return { errorCount, clearErrorCount };
}
