/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { abortable } from './abortable.js';

describe('abortable', () => {
  const neverSettles = () => new Promise<string>(() => {});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve with the value of the promise', async () => {
    const controller = new AbortController();

    await expect(
      abortable(Promise.resolve('value'), controller.signal),
    ).resolves.toBe('value');
  });

  it('should reject with the error of the promise', async () => {
    const controller = new AbortController();
    const error = new Error('operation failed');

    await expect(
      abortable(Promise.reject(error), controller.signal),
    ).rejects.toBe(error);
  });

  it('should reject with an AbortError when the signal aborts before the promise settles', async () => {
    const controller = new AbortController();
    const result = abortable(neverSettles(), controller.signal);

    controller.abort();

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('should reject with an AbortError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      abortable(neverSettles(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('should ignore a rejection of the promise that comes after the abort', async () => {
    const controller = new AbortController();
    let rejectPromise: (reason: Error) => void = () => {};
    const promise = new Promise<string>((_resolve, reject) => {
      rejectPromise = reject;
    });
    const result = abortable(promise, controller.signal);

    controller.abort();
    // Vitest fails the run if this rejection is left unhandled.
    rejectPromise(new Error('late failure'));

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('should ignore a late rejection when the signal was already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    let rejectPromise: (reason: Error) => void = () => {};
    const promise = new Promise<string>((_resolve, reject) => {
      rejectPromise = reject;
    });

    const result = abortable(promise, controller.signal);
    // Vitest fails the run if this rejection is left unhandled.
    rejectPromise(new Error('late failure'));

    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('should remove its abort listener once the promise resolves', async () => {
    const controller = new AbortController();
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeEventListener = vi.spyOn(
      controller.signal,
      'removeEventListener',
    );

    await abortable(Promise.resolve('value'), controller.signal);

    expect(removeEventListener).toHaveBeenCalledWith(
      'abort',
      addEventListener.mock.calls[0][1],
    );
  });

  it('should remove its abort listener once the promise rejects', async () => {
    const controller = new AbortController();
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeEventListener = vi.spyOn(
      controller.signal,
      'removeEventListener',
    );
    const error = new Error('operation failed');

    await expect(
      abortable(Promise.reject(error), controller.signal),
    ).rejects.toBe(error);

    expect(removeEventListener).toHaveBeenCalledWith(
      'abort',
      addEventListener.mock.calls[0][1],
    );
  });
});
