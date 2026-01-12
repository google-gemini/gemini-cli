/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerminalCapabilityManager } from './terminalCapabilityManager.js';
import { EventEmitter } from 'node:events';
import {
  enableKittyKeyboardProtocol,
  enableModifyOtherKeys,
} from '@google/gemini-cli-core';

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
  enableModifyOtherKeys: vi.fn(),
  disableModifyOtherKeys: vi.fn(),
  enableBracketedPasteMode: vi.fn(),
  disableBracketedPasteMode: vi.fn(),
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

  describe('modifyOtherKeys detection', () => {
    it('should detect modifyOtherKeys support (level 2)', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Simulate modifyOtherKeys level 2 response: \x1b[>4;2m
      stdin.emit('data', Buffer.from('\x1b[>4;2m'));
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      expect(enableModifyOtherKeys).toHaveBeenCalled();
    });

    it('should not enable modifyOtherKeys for level 0', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Simulate modifyOtherKeys level 0 response: \x1b[>4;0m
      stdin.emit('data', Buffer.from('\x1b[>4;0m'));
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      expect(enableModifyOtherKeys).not.toHaveBeenCalled();
    });

    it('should prefer Kitty over modifyOtherKeys', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Simulate both Kitty and modifyOtherKeys responses
      stdin.emit('data', Buffer.from('\x1b[?1u'));
      stdin.emit('data', Buffer.from('\x1b[>4;2m'));
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;
      expect(manager.isKittyProtocolEnabled()).toBe(true);

      expect(enableKittyKeyboardProtocol).toHaveBeenCalled();
      expect(enableModifyOtherKeys).not.toHaveBeenCalled();
    });

    it('should enable modifyOtherKeys when Kitty not supported', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Simulate only modifyOtherKeys response (no Kitty)
      stdin.emit('data', Buffer.from('\x1b[>4;2m'));
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      expect(manager.isKittyProtocolEnabled()).toBe(false);
      expect(enableModifyOtherKeys).toHaveBeenCalled();
    });

    it('should handle split modifyOtherKeys response chunks', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Split response: \x1b[>4;2m
      stdin.emit('data', Buffer.from('\x1b[>4;'));
      stdin.emit('data', Buffer.from('2m'));
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      expect(enableModifyOtherKeys).toHaveBeenCalled();
    });

    it('should detect modifyOtherKeys with other capabilities', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      stdin.emit('data', Buffer.from('\x1b]11;rgb:1a1a/1a1a/1a1a\x1b\\')); // background color
      stdin.emit('data', Buffer.from('\x1bP>|tmux\x1b\\')); // Terminal name
      stdin.emit('data', Buffer.from('\x1b[>4;2m')); // modifyOtherKeys
      // Complete detection with DA1
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      expect(manager.getTerminalBackgroundColor()).toBe('#1a1a1a');
      expect(manager.getTerminalName()).toBe('tmux');

      expect(enableModifyOtherKeys).toHaveBeenCalled();
    });

    it('should infer modifyOtherKeys support from Device Attributes (DA1) alone', async () => {
      const manager = TerminalCapabilityManager.getInstance();
      const promise = manager.detectCapabilities();

      // Simulate only DA1 response (no specific MOK or Kitty response)
      stdin.emit('data', Buffer.from('\x1b[?62c'));

      await promise;

      expect(manager.isKittyProtocolEnabled()).toBe(false);
      // It should fall back to modifyOtherKeys because DA1 proves it's an ANSI terminal

      expect(enableModifyOtherKeys).toHaveBeenCalled();
    });
  });
});
