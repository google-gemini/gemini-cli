/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

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
export const OpenFilesSchema = z.object({
  activeFile: z.string(),
  selectedText: z.string().optional(),
  cursor: CursorSchema.optional(),
  recentOpenFiles: z
    .array(
      z.object({
        filePath: z.string(),
        timestamp: z.number(),
      }),
    )
    .optional(),
});
export type OpenFiles = z.infer<typeof OpenFilesSchema>;

/**
 * Zod schema for validating the 'ide/openFilesChanged' notification from the IDE.
 */
export const OpenFilesNotificationSchema = z.object({
  method: z.literal('ide/openFilesChanged'),
  params: OpenFilesSchema,
});

type OpenFilesSubscriber = (openFiles: OpenFiles | undefined) => void;

/**
 * Creates a new store for managing the IDE's active file context.
 * This factory function encapsulates the state and logic, allowing for the creation
 * of isolated instances, which is particularly useful for testing.
 *
 * @returns An object with methods to interact with the active file context.
 */
export function createIdeContextStore() {
  let openFilesContext: OpenFiles | undefined = undefined;
  const subscribers = new Set<OpenFilesSubscriber>();

  /**
   * Notifies all registered subscribers about the current active file context.
   */
  function notifySubscribers(): void {
    for (const subscriber of subscribers) {
      subscriber(openFilesContext);
    }
  }

  /**
   * Sets the active file context and notifies all registered subscribers of the change.
   * @param newOpenFiles The new active file context from the IDE.
   */
  function setOpenFilesContext(newOpenFiles: OpenFiles): void {
    openFilesContext = newOpenFiles;
    notifySubscribers();
  }

  /**
   * Clears the active file context and notifies all registered subscribers of the change.
   */
  function clearOpenFilesContext(): void {
    openFilesContext = undefined;
    notifySubscribers();
  }

  /**
   * Retrieves the current active file context.
   * @returns The `OpenFiles` object if a file is active; otherwise, `undefined`.
   */
  function getOpenFilesContext(): OpenFiles | undefined {
    return openFilesContext;
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
  function subscribeToOpenFiles(subscriber: OpenFilesSubscriber): () => void {
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  }

  return {
    setOpenFilesContext,
    getOpenFilesContext,
    subscribeToOpenFiles,
    clearOpenFilesContext,
  };
}

/**
 * The default, shared instance of the IDE context store for the application.
 */
export const ideContext = createIdeContextStore();
