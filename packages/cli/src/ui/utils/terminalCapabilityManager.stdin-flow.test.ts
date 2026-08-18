/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('node:fs', () => ({
  writeSync: vi.fn(),
}));

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
  disableMouseEvents: vi.fn(),
}));

import { TerminalCapabilityManager } from './terminalCapabilityManager.js';

type MockStdin = EventEmitter & {
  isTTY: boolean;
  isRaw: boolean;
  readableFlowing: boolean | null;
  setRawMode: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
};

describe('TerminalCapabilityManager stdin flow state', () => {
  const originalStdin = process.stdin;
  const originalStdout = process.stdout;
  let stdin: MockStdin;

  beforeEach(() => {
    TerminalCapabilityManager.resetInstanceForTesting();

    stdin = new EventEmitter() as MockStdin;
    stdin.isTTY = true;
    stdin.isRaw = false;
    stdin.readableFlowing = null;
    stdin.setRawMode = vi.fn();
    stdin.pause = vi.fn(() => {
      stdin.readableFlowing = false;
      return stdin;
    });

    Object.defineProperty(process, 'stdin', {
      value: stdin,
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: { isTTY: true, fd: 1 },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('pauses stdin after temporary capability detection when it was not flowing', async () => {
    const manager = TerminalCapabilityManager.getInstance();
    const detection = manager.detectCapabilities();

    stdin.emit('data', Buffer.from('\x1b[?62c'));
    await detection;

    expect(stdin.pause).toHaveBeenCalledOnce();
  });

  it('preserves an already-flowing stdin stream', async () => {
    stdin.readableFlowing = true;
    const manager = TerminalCapabilityManager.getInstance();
    const detection = manager.detectCapabilities();

    stdin.emit('data', Buffer.from('\x1b[?62c'));
    await detection;

    expect(stdin.pause).not.toHaveBeenCalled();
  });
});
