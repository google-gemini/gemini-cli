/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoreEventEmitter, CoreEvent } from './events.js';

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
    const MAX_BACKLOG_SIZE = 100;

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
});
