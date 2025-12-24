/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerminalCapabilityManager } from './terminalCapabilityManager.js';
import { EventEmitter } from 'node:events';

// Mock fs
vi.mock('node:fs', () => ({
  writeSync: vi.fn(),
}));

// Mock core
vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    log: vi.fn(),
    warn: vi.fn(),
  },
  enableKittyKeyboardProtocol: vi.fn(),
  disableKittyKeyboardProtocol: vi.fn(),
}));

describe('TerminalCapabilityManager', () => {
  let stdin: EventEmitter & {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?: (mode: boolean) => void;
    removeListener?: (
      event: string,
      listener: (...args: unknown[]) => void,
    ) => void;
  };
  let stdout: { isTTY?: boolean; fd?: number };
  // Save original process properties
  const originalStdin = process.stdin;
  const originalStdout = process.stdout;

  beforeEach(() => {
    vi.resetAllMocks();

    // Reset singleton
    TerminalCapabilityManager.resetInstanceForTesting();

    // Setup process mocks
    stdin = new EventEmitter();
    stdin.isTTY = true;
    stdin.isRaw = false;
    stdin.setRawMode = vi.fn();
    stdin.removeListener = vi.fn();

    stdout = { isTTY: true, fd: 1 };

    // Use defineProperty to mock process.stdin/stdout
    Object.defineProperty(process, 'stdin', {
      value: stdin,
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: stdout,
      configurable: true,
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore original process properties
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      configurable: true,
    });
  });

  it('should detect Kitty support when u response is received', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Simulate Kitty response: \x1b[?1u
    stdin.emit('data', Buffer.from('\x1b[?1u'));
    // Complete detection with DA1
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    expect(manager.isKittyProtocolEnabled()).toBe(true);
  });

  it('should detect Background Color', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Simulate OSC 11 response
    // \x1b]11;rgb:0000/ff00/0000\x1b\
    // RGB: 0, 255, 0 -> #00ff00
    stdin.emit('data', Buffer.from('\x1b]11;rgb:0000/ffff/0000\x1b\\'));
    // Complete detection with DA1
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    expect(manager.getTerminalBackgroundColor()).toBe('#00ff00');
  });

  it('should detect Terminal Name', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Simulate Terminal Name response
    stdin.emit('data', Buffer.from('\x1bP>|WezTerm 20240203\x1b\\'));
    // Complete detection with DA1
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    expect(manager.getTerminalName()).toBe('WezTerm 20240203');
  });

  it('should complete early if sentinel (DA1) is found', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    stdin.emit('data', Buffer.from('\x1b[?1u'));
    stdin.emit('data', Buffer.from('\x1b]11;rgb:0000/0000/0000\x1b\\'));
    // Sentinel
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    // Should resolve without waiting for timeout
    await promise;

    expect(manager.isKittyProtocolEnabled()).toBe(true);
    expect(manager.getTerminalBackgroundColor()).toBe('#000000');
  });

  it('should timeout if no DA1 (c) is received', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Simulate only Kitty response
    stdin.emit('data', Buffer.from('\x1b[?1u'));

    // Advance to timeout
    vi.advanceTimersByTime(1000);

    await promise;
    expect(manager.isKittyProtocolEnabled()).toBe(true);
  });

  it('should not detect Kitty if only DA1 (c) is received', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Simulate DA1 response only: \x1b[?62;c
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    expect(manager.isKittyProtocolEnabled()).toBe(false);
  });

  it('should handle split chunks', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const promise = manager.detectCapabilities();

    // Split response: \x1b[? 1u
    stdin.emit('data', Buffer.from('\x1b[?'));
    stdin.emit('data', Buffer.from('1u'));
    // Complete with DA1
    stdin.emit('data', Buffer.from('\x1b[?62c'));

    await promise;
    expect(manager.isKittyProtocolEnabled()).toBe(true);
  });
});
