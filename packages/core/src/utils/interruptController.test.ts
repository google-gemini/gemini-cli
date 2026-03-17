/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InterruptController } from './interruptController.js';

describe('InterruptController', () => {
  let controller: InterruptController;

  beforeEach(() => {
    controller = new InterruptController();
  });

  it('should provide a non-aborted signal initially', () => {
    expect(controller.signal).toBeInstanceOf(AbortSignal);
    expect(controller.aborted).toBe(false);
  });

  it('should abort the current signal on interrupt', () => {
    const originalSignal = controller.signal;
    controller.interrupt();

    expect(originalSignal.aborted).toBe(true);
  });

  it('should provide a fresh signal after interrupt', () => {
    const originalSignal = controller.signal;
    controller.interrupt();
    const newSignal = controller.signal;

    expect(newSignal).not.toBe(originalSignal);
    expect(newSignal.aborted).toBe(false);
  });

  it('should forward a custom abort reason', () => {
    const signal = controller.signal;
    controller.interrupt('User spoke a new command');

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('User spoke a new command');
  });

  it('should use a default reason when none is provided', () => {
    const signal = controller.signal;
    controller.interrupt();

    expect(signal.reason).toBe('Interrupted by new input');
  });

  it('should allow successive interrupts', () => {
    const signal1 = controller.signal;
    controller.interrupt();

    const signal2 = controller.signal;
    controller.interrupt();

    const signal3 = controller.signal;

    expect(signal1.aborted).toBe(true);
    expect(signal2.aborted).toBe(true);
    expect(signal3.aborted).toBe(false);
  });

  it('should reset to a fresh signal after abort', () => {
    controller.interrupt();
    expect(controller.aborted).toBe(false); // already fresh after interrupt

    // Manually abort then reset
    const ctrl2 = new InterruptController();
    ctrl2.interrupt();
    ctrl2.reset(); // no-op since interrupt already provisions a new signal
    expect(ctrl2.aborted).toBe(false);
  });

  it('should be a no-op when reset is called on a non-aborted signal', () => {
    const originalSignal = controller.signal;
    controller.reset();

    expect(controller.signal).toBe(originalSignal);
  });

  it('should fire the abort event on listeners', () => {
    let abortFired = false;
    controller.signal.addEventListener('abort', () => {
      abortFired = true;
    });

    controller.interrupt();
    expect(abortFired).toBe(true);
  });

  it('should cancel an in-flight async operation', async () => {
    let wasAborted = false;

    const operation = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => resolve('completed'), 5000);
      controller.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        wasAborted = true;
        reject(new Error('aborted'));
      });
    });

    // Interrupt immediately
    controller.interrupt();

    await expect(operation).rejects.toThrow('aborted');
    expect(wasAborted).toBe(true);

    // New signal is ready for the next operation
    expect(controller.aborted).toBe(false);
  });
});
