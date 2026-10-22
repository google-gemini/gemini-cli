/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IDE_MAX_OPEN_FILES,
  IDE_MAX_SELECTED_TEXT_LENGTH,
} from './constants.js';
import type { IdeContext } from './types.js';

type IdeContextSubscriber = (ideContext?: IdeContext) => void;

/**
 * Patterns of IDE/CLI configuration and instruction metadata files that should
 * be excluded from IDE open-file context synchronization to prevent leaking
 * IDE plugin rules (such as VS Code Gemini Code Assist settings or GEMINI.md)
 * into Gemini CLI prompts.
 */
const EXCLUDED_IDE_CONTEXT_PATH_PATTERNS: readonly RegExp[] = [
  /(?:^|\/)\.(?:vscode|gemini)\/settings\.json$/i,
  /(?:^|\/)(?:(?:Code|VSCodium|Cursor|Windsurf)(?:[^/]*)\/User(?:\/profiles\/[^/]+)?|\.(?:vscode|vscodium|cursor|windsurf)-server\/[^/]+\/Machine)\/settings\.json$/i,
  /(?:^|\/)gemini\.md$/i,
];

/**
 * Returns true if the given file path is an IDE or CLI configuration/metadata
 * file that should not be tracked in IDE open-file context.
 */
export function isExcludedIdeContextFile(filePath: string): boolean {
  if (!filePath) {
    return false;
  }
  const normalized = filePath.replace(/\\/g, '/').trim();
  return EXCLUDED_IDE_CONTEXT_PATH_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

export class IdeContextStore {
  private ideContextState?: IdeContext;
  private readonly subscribers = new Set<IdeContextSubscriber>();

  /**
   * Notifies all registered subscribers about the current IDE context.
   */
  private notifySubscribers(): void {
    for (const subscriber of this.subscribers) {
      subscriber(this.ideContextState);
    }
  }

  /**
   * Sets the IDE context and notifies all registered subscribers of the change.
   * @param newIdeContext The new IDE context from the IDE.
   */
  set(newIdeContext: IdeContext): void {
    const { workspaceState } = newIdeContext;
    if (!workspaceState) {
      this.ideContextState = newIdeContext;
      this.notifySubscribers();
      return;
    }

    if (workspaceState.openFiles) {
      workspaceState.openFiles = workspaceState.openFiles.filter(
        (file) => !isExcludedIdeContextFile(file.path),
      );
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
    this.ideContextState = newIdeContext;
    this.notifySubscribers();
  }

  /**
   * Clears the IDE context and notifies all registered subscribers of the change.
   */
  clear(): void {
    this.ideContextState = undefined;
    this.notifySubscribers();
  }

  /**
   * Retrieves the current IDE context.
   * @returns The `IdeContext` object if a file is active; otherwise, `undefined`.
   */
  get(): IdeContext | undefined {
    return this.ideContextState;
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
  subscribe(subscriber: IdeContextSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }
}

/**
 * The default, shared instance of the IDE context store for the application.
 */
export const ideContextStore = new IdeContextStore();
