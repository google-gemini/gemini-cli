/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * The reserved server name for the IDE's MCP server.
 */
export const IDE_SERVER_NAME = '_ide_server';

/**
 * Zod schema for validating a cursor position.
 */
export const CursorSchema = z.object({
  line: z.number(),
  character: z.number(),
});
export type Cursor = z.infer<typeof CursorSchema>;

/**
 * Zod schema for validating an active file context from the IDE.
 */
export const ActiveFileSchema = z.object({
  filePath: z.string(),
  cursor: CursorSchema.optional(),
});
export type ActiveFile = z.infer<typeof ActiveFileSchema>;

/**
 * Zod schema for validating the 'ide/activeFileChanged' notification from the IDE.
 */
export const ActiveFileNotificationSchema = z.object({
  method: z.literal('ide/activeFileChanged'),
  params: ActiveFileSchema,
});

type ActiveFileSubscriber = (activeFile: ActiveFile | undefined) => void;

/**
 * Creates a new store for managing the IDE's active file context.
 * This factory function encapsulates the state and logic, allowing for the creation
 * of isolated instances, which is particularly useful for testing.
 *
 * @returns An object with methods to interact with the active file context.
 */
export function createIdeContextStore() {
  let activeFileContext: ActiveFile | undefined = undefined;
  const subscribers = new Set<ActiveFileSubscriber>();

  /**
   * Notifies all registered subscribers about the current active file context.
   */
  function notifySubscribers(): void {
    for (const subscriber of subscribers) {
      subscriber(activeFileContext);
    }
  }

  /**
   * Sets the active file context and notifies all registered subscribers of the change.
   * @param newActiveFile The new active file context from the IDE.
   */
  function setActiveFileContext(newActiveFile: ActiveFile): void {
    activeFileContext = newActiveFile;
    notifySubscribers();
  }

  /**
   * Retrieves the current active file context.
   * @returns The `ActiveFile` object if a file is active, otherwise `undefined`.
   */
  function getActiveFileContext(): ActiveFile | undefined {
    return activeFileContext;
  }

  /**
   * Subscribes to changes in the active file context.
   *
   * When the active file context changes, the provided `subscriber` function will be called.
   * Note: The subscriber is not called with the current value upon subscription.
   *
   * @param subscriber The function to be called when the active file context changes.
   * @returns A function that, when called, will unsubscribe the provided subscriber.
   */
  function subscribeToActiveFile(subscriber: ActiveFileSubscriber): () => void {
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  }

  return {
    setActiveFileContext,
    getActiveFileContext,
    subscribeToActiveFile,
  };
}

/**
 * The default, shared instance of the IDE context store for the application.
 */
export const ideContext = createIdeContextStore();
