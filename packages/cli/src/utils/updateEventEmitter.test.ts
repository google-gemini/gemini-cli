/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateEventEmitter,
  isUpdateInProgress,
  setUpdateInProgress,
  waitForUpdateCompletion,
} from './updateEventEmitter.js';

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

describe('update in-progress tracking', () => {
  beforeEach(() => {
    setUpdateInProgress(false);
  });

  afterEach(() => {
    setUpdateInProgress(false);
  });

  it('should default to not in progress', () => {
    expect(isUpdateInProgress()).toBe(false);
  });

  it('should track in-progress state', () => {
    setUpdateInProgress(true);
    expect(isUpdateInProgress()).toBe(true);
    setUpdateInProgress(false);
    expect(isUpdateInProgress()).toBe(false);
  });
});

describe('waitForUpdateCompletion', () => {
  beforeEach(() => {
    setUpdateInProgress(false);
  });

  afterEach(() => {
    setUpdateInProgress(false);
    updateEventEmitter.removeAllListeners('update-success');
    updateEventEmitter.removeAllListeners('update-failed');
  });

  it('should resolve immediately when no update is in progress', async () => {
    await expect(waitForUpdateCompletion(1000)).resolves.toBeUndefined();
  });

  it('should resolve when update-success is emitted', async () => {
    setUpdateInProgress(true);
    const promise = waitForUpdateCompletion(5000);
    updateEventEmitter.emit('update-success', { message: 'done' });
    await expect(promise).resolves.toBeUndefined();
  });

  it('should resolve when update-failed is emitted', async () => {
    setUpdateInProgress(true);
    const promise = waitForUpdateCompletion(5000);
    updateEventEmitter.emit('update-failed', { message: 'error' });
    await expect(promise).resolves.toBeUndefined();
  });

  it('should resolve after timeout if update never completes', async () => {
    setUpdateInProgress(true);
    const start = Date.now();
    await waitForUpdateCompletion(100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });
});
