/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

export const IDE_SERVER_NAME = '_ide_server';

const CursorSchema = z.object({
  line: z.number(),
  character: z.number(),
});

const ActiveFileSchema = z.object({
  filePath: z.string(),
  cursor: CursorSchema,
});
export type ActiveFile = z.infer<typeof ActiveFileSchema>;

export const ActiveFileNotificationSchema = z.object({
  method: z.literal('ide/activeFileChanged'),
  params: ActiveFileSchema,
});

type ActiveFileSubscriber = (activeFile: ActiveFile | undefined) => void;

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
export function setActiveFileContext(newActiveFile: ActiveFile): void {
  activeFileContext = newActiveFile;
  notifySubscribers();
}

/**
 * Retrieves the current active file context.
 * @returns The `ActiveFile` object if a file is active, otherwise `undefined`.
 */
export function getActiveFileContext(): ActiveFile | undefined {
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
export function subscribeToActiveFile(
  subscriber: ActiveFileSubscriber,
): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

/**
 * Resets the active file context to `undefined` and clears all subscribers.
 * This is primarily exposed for testing purposes to ensure a clean state.
 */
export function resetActiveFileContext(): void {
  activeFileContext = undefined;
  subscribers.clear();
}
