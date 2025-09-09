/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';

export enum ExtensionUpdateEvent {
  UpdateAvailable = 'extension-update-available',
  LogError = 'log-error',
}

interface ExtensionUpdateEventTypes {
  [ExtensionUpdateEvent.UpdateAvailable]: [message: string];
  [ExtensionUpdateEvent.LogError]: [message: string];
}

// An event emitter that queues its events until a listener is attached for a
// given event name, ensuring they actually get delivered to some listener.
class ExtensionUpdateEventEmitter extends EventEmitter<ExtensionUpdateEventTypes> {
  private eventQueue: Map<string, unknown[][]> = new Map();

  override emit<K extends keyof ExtensionUpdateEventTypes>(
    event: K,
    ...args: ExtensionUpdateEventTypes[K]
  ): boolean {
    if (this.listenerCount(event) === 0) {
      if (!this.eventQueue.has(event)) {
        this.eventQueue.set(event, []);
      }
      this.eventQueue.get(event)!.push(args);
      return false;
    }
    // Cast to never is necessary here to satisfy the type system.
    return super.emit<K>(event, ...(args as never));
  }

  override on<K extends keyof ExtensionUpdateEventTypes>(
    event: K,
    listener: (...args: ExtensionUpdateEventTypes[K]) => void,
  ): this {
    // Cast to never is necessary here to satisfy the type system.
    super.on(event, listener as never);
    this.flushQueue(event);
    return this;
  }

  private flushQueue(event: string) {
    const queuedEvents = this.eventQueue.get(event);
    if (queuedEvents) {
      this.eventQueue.delete(event);
      for (const args of queuedEvents) {
        // Cast to never is necessary here to satisfy the type system.
        super.emit(event, ...(args as never));
      }
    }
  }
}

/**
 * A shared event emitter for extension update notifications.
 *
 * Immediately delivers any undelivered events since it last had a listener for
 * the subscribed event.
 */
export const extensionUpdateEventEmitter = new ExtensionUpdateEventEmitter();
