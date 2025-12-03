/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { appEvents, AppEvent } from './events.js';

describe('events', () => {
  it('should allow registering and emitting events', () => {
    const callback = vi.fn();
    appEvents.on(AppEvent.OauthDisplayMessage, callback);

    appEvents.emit(AppEvent.OauthDisplayMessage, 'test message');

    expect(callback).toHaveBeenCalledWith('test message');

    appEvents.off(AppEvent.OauthDisplayMessage, callback);
  });

  it('should work with events without data', () => {
    const callback = vi.fn();
    appEvents.on(AppEvent.Flicker, callback);

    appEvents.emit(AppEvent.Flicker);

    expect(callback).toHaveBeenCalled();

    appEvents.off(AppEvent.Flicker, callback);
  });
});
