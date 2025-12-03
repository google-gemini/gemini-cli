/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
const mocks = vi.hoisted(() => ({
  writeSync: vi.fn(),
  enableKittyKeyboardProtocol: vi.fn(),
  disableKittyKeyboardProtocol: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeSync: mocks.writeSync,
}));

vi.mock('@google/gemini-cli-core', () => ({
  enableKittyKeyboardProtocol: mocks.enableKittyKeyboardProtocol,
  disableKittyKeyboardProtocol: mocks.disableKittyKeyboardProtocol,
}));

describe('kittyProtocolDetector', () => {
  let originalStdin: NodeJS.ReadStream & { fd?: number };
  let originalStdout: NodeJS.WriteStream & { fd?: number };
  let stdinListeners: Record<string, (data: Buffer) => void> = {};

  // Module functions
  let detectAndEnableKittyProtocol: typeof import('./kittyProtocolDetector.js').detectAndEnableKittyProtocol;
  let isKittyProtocolEnabled: typeof import('./kittyProtocolDetector.js').isKittyProtocolEnabled;
  let enableSupportedProtocol: typeof import('./kittyProtocolDetector.js').enableSupportedProtocol;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.useFakeTimers();

    const mod = await import('./kittyProtocolDetector.js');
    detectAndEnableKittyProtocol = mod.detectAndEnableKittyProtocol;
    isKittyProtocolEnabled = mod.isKittyProtocolEnabled;
    enableSupportedProtocol = mod.enableSupportedProtocol;

    // Mock process.stdin and stdout
    originalStdin = process.stdin;
    originalStdout = process.stdout;

    stdinListeners = {};

    Object.defineProperty(process, 'stdin', {
      value: {
        isTTY: true,
        isRaw: false,
        setRawMode: vi.fn(),
        on: vi.fn((event, handler) => {
          stdinListeners[event] = handler;
        }),
        removeListener: vi.fn(),
      },
      configurable: true,
    });

    Object.defineProperty(process, 'stdout', {
      value: {
        isTTY: true,
        fd: 1,
      },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: originalStdin });
    Object.defineProperty(process, 'stdout', { value: originalStdout });
    vi.useRealTimers();
  });

  it('should resolve immediately if not TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false });
    await detectAndEnableKittyProtocol();
    expect(mocks.writeSync).not.toHaveBeenCalled();
  });

  it('should enable protocol if response indicates support', async () => {
    const promise = detectAndEnableKittyProtocol();

    // Simulate response
    expect(stdinListeners['data']).toBeDefined();

    // Send progressive enhancement response
    stdinListeners['data'](Buffer.from('\x1b[?u'));

    // Send device attributes response
    stdinListeners['data'](Buffer.from('\x1b[?c'));

    await promise;

    expect(mocks.enableKittyKeyboardProtocol).toHaveBeenCalled();
    expect(isKittyProtocolEnabled()).toBe(true);
  });

  it('should not enable protocol if timeout occurs', async () => {
    const promise = detectAndEnableKittyProtocol();

    // Fast forward time past timeout
    vi.advanceTimersByTime(300);

    await promise;

    expect(mocks.enableKittyKeyboardProtocol).not.toHaveBeenCalled();
  });

  it('should wait longer if progressive enhancement received but not attributes', async () => {
    const promise = detectAndEnableKittyProtocol();

    // Send progressive enhancement response
    stdinListeners['data'](Buffer.from('\x1b[?u'));

    // Should not resolve yet
    vi.advanceTimersByTime(300); // Original timeout passed

    // Send device attributes response late
    stdinListeners['data'](Buffer.from('\x1b[?c'));

    await promise;

    expect(mocks.enableKittyKeyboardProtocol).toHaveBeenCalled();
  });

  it('should handle re-enabling protocol', async () => {
    // First, simulate successful detection to set kittySupported = true
    const promise = detectAndEnableKittyProtocol();
    stdinListeners['data'](Buffer.from('\x1b[?u'));
    stdinListeners['data'](Buffer.from('\x1b[?c'));
    await promise;

    // Reset mocks to clear previous calls
    mocks.enableKittyKeyboardProtocol.mockClear();

    // Now test re-enabling
    enableSupportedProtocol();
    expect(mocks.enableKittyKeyboardProtocol).toHaveBeenCalled();
  });
});
