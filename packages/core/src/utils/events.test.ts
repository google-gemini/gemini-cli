/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CoreEventEmitter,
  CoreEvent,
  type UserFeedbackPayload,
} from './events.js';

describe('CoreEventEmitter', () => {
  let events: CoreEventEmitter;

  beforeEach(() => {
    events = new CoreEventEmitter();
  });

  it('should emit feedback immediately when a listener is present', () => {
    const listener = vi.fn();
    events.on(CoreEvent.UserFeedback, listener);

    const payload = {
      severity: 'info' as const,
      message: 'Test message',
    };

    events.emitFeedback(payload.severity, payload.message);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining(payload));
  });

  it('should buffer feedback when no listener is present', () => {
    const listener = vi.fn();
    const payload = {
      severity: 'warning' as const,
      message: 'Buffered message',
    };

    // Emit while no listeners attached
    events.emitFeedback(payload.severity, payload.message);
    expect(listener).not.toHaveBeenCalled();

    // Attach listener and drain
    events.on(CoreEvent.UserFeedback, listener);
    events.drainFeedbackBacklog();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining(payload));
  });

  it('should respect the backlog size limit and maintain FIFO order', () => {
    const listener = vi.fn();
    const MAX_BACKLOG_SIZE = 10000;

    for (let i = 0; i < MAX_BACKLOG_SIZE + 10; i++) {
      events.emitFeedback('info', `Message ${i}`);
    }

    events.on(CoreEvent.UserFeedback, listener);
    events.drainFeedbackBacklog();

    expect(listener).toHaveBeenCalledTimes(MAX_BACKLOG_SIZE);
    // Verify strictly that the FIRST call was Message 10 (0-9 dropped)
    expect(listener.mock.calls[0][0]).toMatchObject({ message: 'Message 10' });
    // Verify strictly that the LAST call was Message 109
    expect(listener.mock.lastCall?.[0]).toMatchObject({
      message: `Message ${MAX_BACKLOG_SIZE + 9}`,
    });
  });

  it('should clear the backlog after draining', () => {
    const listener = vi.fn();
    events.emitFeedback('error', 'Test error');

    events.on(CoreEvent.UserFeedback, listener);
    events.drainFeedbackBacklog();
    expect(listener).toHaveBeenCalledTimes(1);

    listener.mockClear();
    events.drainFeedbackBacklog();
    expect(listener).not.toHaveBeenCalled();
  });

  it('should include optional error object in payload', () => {
    const listener = vi.fn();
    events.on(CoreEvent.UserFeedback, listener);

    const error = new Error('Original error');
    events.emitFeedback('error', 'Something went wrong', error);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        message: 'Something went wrong',
        error,
      }),
    );
  });

  it('should handle multiple listeners correctly', () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    events.on(CoreEvent.UserFeedback, listenerA);
    events.on(CoreEvent.UserFeedback, listenerB);

    events.emitFeedback('info', 'Broadcast message');

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
  });

  it('should stop receiving events after off() is called', () => {
    const listener = vi.fn();
    events.on(CoreEvent.UserFeedback, listener);

    events.emitFeedback('info', 'First message');
    expect(listener).toHaveBeenCalledTimes(1);

    events.off(CoreEvent.UserFeedback, listener);
    events.emitFeedback('info', 'Second message');
    expect(listener).toHaveBeenCalledTimes(1); // Still 1
  });

  it('should handle re-entrant feedback emission during draining safely', () => {
    events.emitFeedback('info', 'Buffered 1');
    events.emitFeedback('info', 'Buffered 2');

    const listener = vi.fn((payload: UserFeedbackPayload) => {
      // When 'Buffered 1' is received, immediately emit another event.
      if (payload.message === 'Buffered 1') {
        events.emitFeedback('warning', 'Re-entrant message');
      }
    });

    events.on(CoreEvent.UserFeedback, listener);
    events.drainFeedbackBacklog();

    // Expectation with atomic snapshot:
    // 1. loop starts with ['Buffered 1', 'Buffered 2']
    // 2. emits 'Buffered 1'
    // 3. listener fires for 'Buffered 1', calls emitFeedback('Re-entrant')
    // 4. emitFeedback sees listener attached, emits 'Re-entrant' synchronously
    // 5. listener fires for 'Re-entrant'
    // 6. loop continues, emits 'Buffered 2'
    // 7. listener fires for 'Buffered 2'

    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls[0][0]).toMatchObject({ message: 'Buffered 1' });
    expect(listener.mock.calls[1][0]).toMatchObject({
      message: 'Re-entrant message',
    });
    expect(listener.mock.calls[2][0]).toMatchObject({ message: 'Buffered 2' });
  });

  describe('ModelChanged Event', () => {
    it('should emit ModelChanged event with correct payload', () => {
      const listener = vi.fn();
      events.on(CoreEvent.ModelChanged, listener);

      const newModel = 'gemini-2.5-pro';
      events.emitModelChanged(newModel);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ model: newModel });
    });
  });
});
