/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { setupStdinCancellation } from './stdinCancellation.js';

type StdinWithRawMode = typeof process.stdin & {
  setRawMode?: (mode: boolean) => boolean;
};

type KeypressHandler = (
  str: string,
  key: { name?: string; ctrl?: boolean },
) => void;

type ProcessHandler = (...args: unknown[]) => void;

let originalIsTTY: boolean | undefined;
let originalSetRawMode: StdinWithRawMode['setRawMode'];
let setRawModeSpy: MockInstance;
let stdinOnSpy: MockInstance;

function captureProcessHandlers() {
  const handlers = new Map<string | symbol, ProcessHandler>();
  vi.spyOn(process, 'on').mockImplementation((event, listener) => {
    handlers.set(event, listener as ProcessHandler);
    return process;
  });
  vi.spyOn(process, 'off').mockImplementation(() => process);
  return handlers;
}

describe('setupStdinCancellation', () => {
  beforeEach(() => {
    const stdin = process.stdin as StdinWithRawMode;
    originalIsTTY = process.stdin.isTTY;
    originalSetRawMode = stdin.setRawMode;

    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    if (!originalSetRawMode) {
      stdin.setRawMode = vi.fn();
    }

    setRawModeSpy = vi
      .spyOn(
        stdin as typeof stdin & { setRawMode: (mode: boolean) => boolean },
        'setRawMode',
      )
      .mockImplementation(() => true);
    stdinOnSpy = vi
      .spyOn(process.stdin, 'on')
      .mockImplementation(() => process.stdin);
    vi.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);
    vi.spyOn(process.stdin, 'pause').mockImplementation(() => process.stdin);
    vi.spyOn(process.stdin, 'removeListener').mockImplementation(
      () => process.stdin,
    );
  });

  afterEach(() => {
    const stdin = process.stdin as StdinWithRawMode;

    vi.restoreAllMocks();
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    if (originalSetRawMode) {
      stdin.setRawMode = originalSetRawMode;
    } else {
      Reflect.deleteProperty(stdin, 'setRawMode');
    }
  });

  it('restores stdin raw mode from the process exit handler', () => {
    const handlers = captureProcessHandlers();
    const cleanup = setupStdinCancellation({
      abortController: new AbortController(),
    });

    handlers.get('exit')?.();

    expect(setRawModeSpy).toHaveBeenCalledWith(false);
    expect(process.off).toHaveBeenCalledWith('exit', cleanup);
  });

  it('does not install cleanup signal handlers when stdin is not a TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      configurable: true,
    });
    const handlers = captureProcessHandlers();

    setupStdinCancellation({ abortController: new AbortController() });

    expect([...handlers.keys()]).toEqual(['exit']);
    expect(setRawModeSpy).not.toHaveBeenCalled();
  });

  it('aborts and restores stdin from cleanup signals without exiting', () => {
    const abortController = new AbortController();
    const handlers = captureProcessHandlers();
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code}) called`);
    });

    setupStdinCancellation({ abortController });

    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining([
        'SIGINT',
        'SIGTERM',
        'SIGHUP',
        'SIGBREAK',
        'SIGQUIT',
      ]),
    );

    handlers.get('SIGTERM')?.();

    expect(abortController.signal.aborted).toBe(true);
    expect(process.exit).not.toHaveBeenCalled();
    expect(setRawModeSpy).toHaveBeenCalledWith(false);
    expect(process.off).toHaveBeenCalledWith(
      'SIGTERM',
      handlers.get('SIGTERM'),
    );
  });

  it('aborts on the first Ctrl+C and force exits on a second Ctrl+C', () => {
    const abortController = new AbortController();
    let keypressHandler: KeypressHandler | undefined;
    captureProcessHandlers();
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code}) called`);
    });
    stdinOnSpy.mockImplementation((event, listener) => {
      if (String(event) === 'keypress') {
        keypressHandler = listener as KeypressHandler;
      }
      return process.stdin;
    });

    setupStdinCancellation({ abortController });
    keypressHandler?.('\u0003', { ctrl: true, name: 'c' });

    expect(abortController.signal.aborted).toBe(true);
    expect(() =>
      keypressHandler?.('\u0003', { ctrl: true, name: 'c' }),
    ).toThrow('process.exit(130) called');
    expect(setRawModeSpy).toHaveBeenCalledWith(false);
    expect(process.exit).toHaveBeenCalledWith(130);
  });
});
