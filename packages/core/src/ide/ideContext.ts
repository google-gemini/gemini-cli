/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IDE_MAX_OPEN_FILES,
  IDE_MAX_SELECTED_TEXT_LENGTH,
  IDE_MAX_DIAGNOSTIC_FILES,
  IDE_MAX_DIAGNOSTICS_PER_FILE,
  IDE_MAX_DIAGNOSTIC_MESSAGE_LENGTH,
} from './constants.js';
import type { IdeContext } from './types.js';

type IdeContextSubscriber = (ideContext?: IdeContext) => void;

const DIAGNOSTIC_SEVERITY_ORDER: Record<string, number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
};

type DiagnosticItemLike = {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: string;
  message: string;
  source?: string;
  code?: string | number;
};

function compareDiagnosticItems(
  a: DiagnosticItemLike,
  b: DiagnosticItemLike,
): number {
  if (a.range.start.line !== b.range.start.line) {
    return a.range.start.line - b.range.start.line;
  }
  if (a.range.start.character !== b.range.start.character) {
    return a.range.start.character - b.range.start.character;
  }
  if (a.range.end.line !== b.range.end.line) {
    return a.range.end.line - b.range.end.line;
  }
  if (a.range.end.character !== b.range.end.character) {
    return a.range.end.character - b.range.end.character;
  }
  const severityDelta =
    (DIAGNOSTIC_SEVERITY_ORDER[a.severity] ?? 99) -
    (DIAGNOSTIC_SEVERITY_ORDER[b.severity] ?? 99);
  if (severityDelta !== 0) {
    return severityDelta;
  }
  if (a.message !== b.message) {
    return a.message.localeCompare(b.message);
  }
  if ((a.source || '') !== (b.source || '')) {
    return (a.source || '').localeCompare(b.source || '');
  }
  if (a.code !== b.code) {
    return String(a.code ?? '').localeCompare(String(b.code ?? ''));
  }
  return 0;
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

    const { openFiles } = workspaceState;
    const { diagnostics } = workspaceState;

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

    if (diagnostics && diagnostics.length > 0) {
      diagnostics.sort(
        (a, b) => b.timestamp - a.timestamp || a.path.localeCompare(b.path),
      );

      for (const diagnosticFile of diagnostics) {
        if (diagnosticFile.items && diagnosticFile.items.length > 0) {
          diagnosticFile.items.sort(compareDiagnosticItems);
          if (diagnosticFile.items.length > IDE_MAX_DIAGNOSTICS_PER_FILE) {
            diagnosticFile.items = diagnosticFile.items.slice(
              0,
              IDE_MAX_DIAGNOSTICS_PER_FILE,
            );
          }

          for (const item of diagnosticFile.items) {
            if (item.message.length > IDE_MAX_DIAGNOSTIC_MESSAGE_LENGTH) {
              item.message =
                item.message.substring(0, IDE_MAX_DIAGNOSTIC_MESSAGE_LENGTH) +
                '... [TRUNCATED]';
            }
          }
        }
      }

      if (diagnostics.length > IDE_MAX_DIAGNOSTIC_FILES) {
        workspaceState.diagnostics = diagnostics.slice(
          0,
          IDE_MAX_DIAGNOSTIC_FILES,
        );
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
