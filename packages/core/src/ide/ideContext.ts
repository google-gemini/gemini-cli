/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import {
  IDE_MAX_OPEN_FILES,
  IDE_MAX_SELECTED_TEXT_LENGTH,
} from './constants.js';
import type { IdeContext } from './types.js';

export const IdeDiffAcceptedNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('ide/diffAccepted'),
  params: z.object({
    filePath: z.string(),
    content: z.string(),
  }),
});

export const IdeDiffClosedNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('ide/diffClosed'),
  params: z.object({
    filePath: z.string(),
    content: z.string().optional(),
  }),
});

export const CloseDiffResponseSchema = z
  .object({
    content: z
      .array(
        z.object({
          text: z.string(),
          type: z.literal('text'),
        }),
      )
      .min(1),
  })
  .transform((val, ctx) => {
    try {
      const parsed = JSON.parse(val.content[0].text);
      const innerSchema = z.object({ content: z.string().optional() });
      const validationResult = innerSchema.safeParse(parsed);
      if (!validationResult.success) {
        validationResult.error.issues.forEach((issue) => ctx.addIssue(issue));
        return z.NEVER;
      }
      return validationResult.data;
    } catch (_) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid JSON in text content',
      });
      return z.NEVER;
    }
  });

export type DiffUpdateResult =
  | {
      status: 'accepted';
      content?: string;
    }
  | {
      status: 'rejected';
      content: undefined;
    };

type IdeContextSubscriber = (ideContext: IdeContext | undefined) => void;

/**
 * Creates a new store for managing the IDE's context.
 * This factory function encapsulates the state and logic, allowing for the creation
 * of isolated instances, which is particularly useful for testing.
 *
 * @returns An object with methods to interact with the IDE context.
 */
export function createIdeContextStore() {
  let ideContextState: IdeContext | undefined = undefined;
  const subscribers = new Set<IdeContextSubscriber>();

  /**
   * Notifies all registered subscribers about the current IDE context.
   */
  function notifySubscribers(): void {
    for (const subscriber of subscribers) {
      subscriber(ideContextState);
    }
  }

  /**
   * Sets the IDE context and notifies all registered subscribers of the change.
   * @param newIdeContext The new IDE context from the IDE.
   */
  function setIdeContext(newIdeContext: IdeContext): void {
    const { workspaceState } = newIdeContext;
    if (!workspaceState) {
      ideContextState = newIdeContext;
      notifySubscribers();
      return;
    }

    const { openFiles } = workspaceState;

    if (openFiles && openFiles.length > 0) {
      // Sort by timestamp descending (newest first)
      openFiles.sort((a, b) => b.timestamp - a.timestamp);

      // The most recent file is now at index 0.
      const mostRecentFile = openFiles[0];

      // If the most recent file is not active, then no file is active.
      if (!mostRecentFile.isActive) {
        openFiles.forEach((file) => {
          file.isActive = false;
          file.cursor = undefined;
          file.selectedText = undefined;
        });
      } else {
        // The most recent file is active. Ensure it's the only one.
        openFiles.forEach((file, index: number) => {
          if (index !== 0) {
            file.isActive = false;
            file.cursor = undefined;
            file.selectedText = undefined;
          }
        });

        // Truncate selected text in the active file
        if (
          mostRecentFile.selectedText &&
          mostRecentFile.selectedText.length > IDE_MAX_SELECTED_TEXT_LENGTH
        ) {
          mostRecentFile.selectedText =
            mostRecentFile.selectedText.substring(
              0,
              IDE_MAX_SELECTED_TEXT_LENGTH,
            ) + '... [TRUNCATED]';
        }
      }

      // Truncate files list
      if (openFiles.length > IDE_MAX_OPEN_FILES) {
        workspaceState.openFiles = openFiles.slice(0, IDE_MAX_OPEN_FILES);
      }
    }
    ideContextState = newIdeContext;
    notifySubscribers();
  }

  /**
   * Clears the IDE context and notifies all registered subscribers of the change.
   */
  function clearIdeContext(): void {
    ideContextState = undefined;
    notifySubscribers();
  }

  /**
   * Retrieves the current IDE context.
   * @returns The `IdeContext` object if a file is active; otherwise, `undefined`.
   */
  function getIdeContext(): IdeContext | undefined {
    return ideContextState;
  }

  /**
   * Subscribes to changes in the IDE context.
   *
   * When the IDE context changes, the provided `subscriber` function will be called.
   * Note: The subscriber is not called with the current value upon subscription.
   *
   * @param subscriber The function to be called when the IDE context changes.
   * @returns A function that, when called, will unsubscribe the provided subscriber.
   */
  function subscribeToIdeContext(subscriber: IdeContextSubscriber): () => void {
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  }

  return {
    setIdeContext,
    getIdeContext,
    subscribeToIdeContext,
    clearIdeContext,
  };
}

/**
 * The default, shared instance of the IDE context store for the application.
 */
export const ideContext = createIdeContextStore();
