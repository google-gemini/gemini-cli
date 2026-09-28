/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';

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

type TestStdin = PassThrough & {
  isTTY: boolean;
  isRaw: boolean;
  setRawMode: ReturnType<typeof vi.fn>;
};

describe('TerminalCapabilityManager stdin flow state', () => {
  const originalStdin = process.stdin;
  const originalStdout = process.stdout;
  let stdin: TestStdin;

  beforeEach(() => {
    TerminalCapabilityManager.resetInstanceForTesting();

    stdin = new PassThrough() as TestStdin;
    stdin.isTTY = true;
    stdin.isRaw = true;
    stdin.setRawMode = vi.fn((mode: boolean) => {
      stdin.isRaw = mode;
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

  it('pauses stdin after capability detection when not initially flowing and delivers keystrokes once resumed', async () => {
    const pauseSpy = vi.spyOn(stdin, 'pause');
    expect(stdin.readableFlowing).toBeNull();

    const manager = TerminalCapabilityManager.getInstance();
    const detection = manager.detectCapabilities();

    stdin.write(Buffer.from('\x1b[?62c'));
    await detection;

    expect(pauseSpy).toHaveBeenCalledOnce();
    expect(stdin.isPaused()).toBe(true);
    expect(stdin.readableFlowing).toBe(false);

    // Simulate KeypressProvider attaching a data listener and calling resume()
    const received: string[] = [];
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk: string) => {
      received.push(chunk);
    });
    stdin.resume();

    stdin.write('hello');
    expect(stdin.isPaused()).toBe(false);
    expect(received).toEqual(['hello']);
  });

  it('does not pause stdin if another data listener is registered during capability detection', async () => {
    const pauseSpy = vi.spyOn(stdin, 'pause');
    const manager = TerminalCapabilityManager.getInstance();
    const detection = manager.detectCapabilities();

    const concurrentListener = vi.fn();
    stdin.on('data', concurrentListener);

    stdin.write(Buffer.from('\x1b[?62c'));
    await detection;

    expect(pauseSpy).not.toHaveBeenCalled();
    expect(stdin.isPaused()).toBe(false);
    stdin.removeListener('data', concurrentListener);
  });

  it('preserves an already-flowing stdin stream', async () => {
    const preExistingListener = vi.fn();
    stdin.on('data', preExistingListener);
    expect(stdin.readableFlowing).toBe(true);

    const pauseSpy = vi.spyOn(stdin, 'pause');
    const manager = TerminalCapabilityManager.getInstance();
    const detection = manager.detectCapabilities();

    stdin.write(Buffer.from('\x1b[?62c'));
    await detection;

    expect(pauseSpy).not.toHaveBeenCalled();
    expect(stdin.isPaused()).toBe(false);
    stdin.removeListener('data', preExistingListener);
  });
});
