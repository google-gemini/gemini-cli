/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readStdin } from './readStdin.js';
import { EventEmitter } from 'node:events';

// Mock debugLogger to avoid clutter
vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
}));

describe('readStdin EIO Reproduction', () => {
  let originalStdin: typeof process.stdin;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fakeStdin: EventEmitter & { setEncoding: any; read: any; destroy: any };

  beforeEach(() => {
    originalStdin = process.stdin;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fakeStdin = new EventEmitter() as any;
    fakeStdin.setEncoding = vi.fn();
    fakeStdin.read = vi.fn().mockReturnValue(null); // Return null to simulate end of reading or no data
    fakeStdin.destroy = vi.fn();

    Object.defineProperty(process, 'stdin', {
      value: fakeStdin,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('crashes (throws unhandled error) if EIO happens after readStdin completes', async () => {
    const promise = readStdin();
    fakeStdin.emit('end');
    await promise;

    // Verify listeners are removed (implementation detail check)

    // We expect 1 listener now (our no-op handler) because we started with 0.

    expect(fakeStdin.listenerCount('error')).toBe(1);

    // This mimics the crash.

    // We expect this NOT to throw now that we've added a no-op handler.

    expect(() => {
      fakeStdin.emit('error', new Error('EIO'));
    }).not.toThrow();
  });

  it('does NOT add a no-op handler if another error listener is present', async () => {
    const customErrorHandler = vi.fn();

    fakeStdin.on('error', customErrorHandler);

    const promise = readStdin();

    fakeStdin.emit('end');

    await promise;

    // It should have exactly 1 listener (our custom one), not 2.

    expect(fakeStdin.listenerCount('error')).toBe(1);

    expect(fakeStdin.listeners('error')).toContain(customErrorHandler);

    // Triggering error should call our handler and NOT crash (because there is a listener)

    const error = new Error('EIO');

    fakeStdin.emit('error', error);

    expect(customErrorHandler).toHaveBeenCalledWith(error);
  });
});
