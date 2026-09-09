/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { updateEventEmitter } from './updateEventEmitter.js';

describe('updateEventEmitter', () => {
  it('should allow registering and emitting events', () => {
    const callback = vi.fn();
    const eventName = 'test-event';

    updateEventEmitter.on(eventName, callback);
    updateEventEmitter.emit(eventName, 'test-data');

    expect(callback).toHaveBeenCalledWith('test-data');

    updateEventEmitter.off(eventName, callback);
  });
});
