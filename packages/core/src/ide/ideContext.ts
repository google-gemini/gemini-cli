/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * Zod schema for validating a file context from the IDE.
 */
export const FileSchema = z.object({
  path: z.string(),
  timestamp: z.number(),
  isActive: z.boolean().optional(),
  selectedText: z.string().optional(),
  cursor: z
    .object({
      line: z.number(),
      character: z.number(),
    })
    .optional(),
});
export type File = z.infer<typeof FileSchema>;

export const IdeContextSchema = z.object({
  workspaceState: z
    .object({
      openFiles: z.array(FileSchema).optional(),
      isTrusted: z.boolean().optional(),
    })
    .optional(),
});
export type IdeContext = z.infer<typeof IdeContextSchema>;

/**
 * Zod schema for validating the 'ide/contextUpdate' notification from the IDE.
 */
export const IdeContextNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('ide/contextUpdate'),
  params: IdeContextSchema,
});

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
