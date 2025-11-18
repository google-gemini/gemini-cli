/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { updateEventEmitter } from './updateEventEmitter.js';

describe('updateEventEmitter', () => {
  it('should be an instance of EventEmitter', () => {
    expect(updateEventEmitter).toBeInstanceOf(EventEmitter);
  });

  it('should be able to emit and listen to custom events', () => {
    const listener = vi.fn();
    const eventName = 'test-event';

    updateEventEmitter.on(eventName, listener);
    updateEventEmitter.emit(eventName, 'test data');

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('test data');

    updateEventEmitter.off(eventName, listener);
  });

  it('should support multiple listeners for the same event', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const eventName = 'multi-listener-event';

    updateEventEmitter.on(eventName, listener1);
    updateEventEmitter.on(eventName, listener2);

    updateEventEmitter.emit(eventName, 'data');

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();

    updateEventEmitter.off(eventName, listener1);
    updateEventEmitter.off(eventName, listener2);
  });

  it('should support removing listeners', () => {
    const listener = vi.fn();
    const eventName = 'removable-event';

    updateEventEmitter.on(eventName, listener);
    updateEventEmitter.off(eventName, listener);

    updateEventEmitter.emit(eventName);

    expect(listener).not.toHaveBeenCalled();
  });

  it('should support once listeners', () => {
    const listener = vi.fn();
    const eventName = 'once-event';

    updateEventEmitter.once(eventName, listener);

    updateEventEmitter.emit(eventName, 'first');
    updateEventEmitter.emit(eventName, 'second');

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('first');
  });

  it('should isolate different event types', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    updateEventEmitter.on('event1', listener1);
    updateEventEmitter.on('event2', listener2);

    updateEventEmitter.emit('event1', 'data1');

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener1).toHaveBeenCalledWith('data1');
    expect(listener2).not.toHaveBeenCalled();

    updateEventEmitter.off('event1', listener1);
    updateEventEmitter.off('event2', listener2);
  });

  it('should handle events with multiple arguments', () => {
    const listener = vi.fn();
    const eventName = 'multi-arg-event';

    updateEventEmitter.on(eventName, listener);
    updateEventEmitter.emit(eventName, 'arg1', 'arg2', 'arg3');

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');

    updateEventEmitter.off(eventName, listener);
  });

  it('should handle events with no arguments', () => {
    const listener = vi.fn();
    const eventName = 'no-arg-event';

    updateEventEmitter.on(eventName, listener);
    updateEventEmitter.emit(eventName);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith();

    updateEventEmitter.off(eventName, listener);
  });

  it('should be reusable across multiple test cases', () => {
    const listener = vi.fn();
    const eventName = 'reusable-event';

    updateEventEmitter.on(eventName, listener);
    updateEventEmitter.emit(eventName);

    expect(listener).toHaveBeenCalledOnce();

    updateEventEmitter.off(eventName, listener);
    listener.mockClear();

    updateEventEmitter.on(eventName, listener);
    updateEventEmitter.emit(eventName);

    expect(listener).toHaveBeenCalledOnce();

    updateEventEmitter.off(eventName, listener);
  });
});
