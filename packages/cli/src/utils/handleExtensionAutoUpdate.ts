/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItemWithoutId } from '../ui/types.js';
import { MessageType } from '../ui/types.js';
import {
  extensionUpdateEventEmitter,
  ExtensionUpdateEvent,
} from './extensionUpdateEventEmitter.js';

export function setExtensionUpdateHandler(
  addItem: (item: HistoryItemWithoutId, timestamp: number) => void,
): () => void {
  const successHandler = (message: string) => {
    addItem(
      {
        type: MessageType.INFO,
        text: message,
      },
      Date.now(),
    );
  };

  const errorHandler = (message: string) => {
    addItem(
      {
        type: MessageType.ERROR,
        text: message,
      },
      Date.now(),
    );
  };

  extensionUpdateEventEmitter.on(
    ExtensionUpdateEvent.UpdateAvailable,
    successHandler,
  );
  extensionUpdateEventEmitter.on(ExtensionUpdateEvent.LogError, errorHandler);

  return () => {
    extensionUpdateEventEmitter.off(
      ExtensionUpdateEvent.UpdateAvailable,
      successHandler,
    );
    extensionUpdateEventEmitter.off(
      ExtensionUpdateEvent.LogError,
      errorHandler,
    );
  };
}
