/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  extensionUpdateEventEmitter,
  ExtensionUpdateEvent,
} from './extensionUpdateEventEmitter.js';

describe('ExtensionUpdateEventEmitter', () => {
  afterEach(() => {
    extensionUpdateEventEmitter.removeAllListeners();
  });

  it('should queue events when no listeners are attached', () => {
    const event = ExtensionUpdateEvent.UpdateAvailable;
    const data = 'hello';

    extensionUpdateEventEmitter.emit(event, data);

    const listener = vi.fn();
    extensionUpdateEventEmitter.on(event, listener);

    expect(listener).toHaveBeenCalledWith(data);
  });

  it('should deliver events immediately when a listener is attached', () => {
    const event = ExtensionUpdateEvent.UpdateAvailable;
    const data = 'hello';
    const listener = vi.fn();

    extensionUpdateEventEmitter.on(event, listener);
    extensionUpdateEventEmitter.emit(event, data);

    expect(listener).toHaveBeenCalledWith(data);
  });

  it('should flush queued events when a listener is attached', () => {
    const event = ExtensionUpdateEvent.UpdateAvailable;
    const data1 = 'hello';
    const data2 = 'world';

    extensionUpdateEventEmitter.emit(event, data1);
    extensionUpdateEventEmitter.emit(event, data2);

    const listener = vi.fn();
    extensionUpdateEventEmitter.on(event, listener);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith(data1);
    expect(listener).toHaveBeenCalledWith(data2);
  });

  it('should handle event queues independently', () => {
    const event1 = ExtensionUpdateEvent.UpdateAvailable;
    const event2 = ExtensionUpdateEvent.LogError;
    const data1 = 'data1';
    const data2 = 'data2';

    extensionUpdateEventEmitter.emit(event1, data1);
    extensionUpdateEventEmitter.emit(event2, data2);

    const listener1 = vi.fn();
    extensionUpdateEventEmitter.on(event1, listener1);

    expect(listener1).toHaveBeenCalledWith(data1);
    expect(listener1).toHaveBeenCalledTimes(1);

    const listener2 = vi.fn();
    extensionUpdateEventEmitter.on(event2, listener2);

    expect(listener2).toHaveBeenCalledWith(data2);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('should not flush events for one event when listener for another is attached', () => {
    const event1 = ExtensionUpdateEvent.UpdateAvailable;
    const event2 = ExtensionUpdateEvent.LogError;
    const data1 = 'data1';
    const data2 = 'data2';

    extensionUpdateEventEmitter.emit(event1, data1);
    extensionUpdateEventEmitter.emit(event2, data2);

    const listener2 = vi.fn();
    extensionUpdateEventEmitter.on(event2, listener2);

    expect(listener2).toHaveBeenCalledWith(data2);
    expect(listener2).toHaveBeenCalledTimes(1);

    const listener1 = vi.fn();
    extensionUpdateEventEmitter.on(event1, listener1);

    expect(listener1).toHaveBeenCalledWith(data1);
    expect(listener1).toHaveBeenCalledTimes(1);
  });
});
