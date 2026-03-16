/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsolePatcher } from './ConsolePatcher.js';

describe('ConsolePatcher', () => {
  let patcher: ConsolePatcher;
  const onNewMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (patcher) {
      patcher.cleanup();
    }
  });

  it('should suppress output when suppressConsoleOutput is true and debugMode is false', () => {
    // We need to spy on the original console methods that ConsolePatcher will call
    // ConsolePatcher captures the original methods at construction time or patch time?
    // It captures them at construction time.

    const originalLog = console.log;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    patcher = new ConsolePatcher({
      debugMode: false,
      suppressConsoleOutput: true,
      stderr: true,
    });
    patcher.patch();

    console.log('test log');

    expect(logSpy).not.toHaveBeenCalled();

    patcher.cleanup();
    logSpy.mockRestore();
    console.log = originalLog;
  });

  it('should NOT suppress output when suppressConsoleOutput is true but debugMode is true', () => {
    const originalError = console.error;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    patcher = new ConsolePatcher({
      debugMode: true,
      suppressConsoleOutput: true,
      stderr: true,
    });
    patcher.patch();

    console.log('test log');
    // When stderr is true, log goes to originalConsoleError
    expect(errorSpy).toHaveBeenCalled();

    patcher.cleanup();
    errorSpy.mockRestore();
    console.error = originalError;
  });

  it('should NOT suppress output when suppressConsoleOutput is false', () => {
    const originalError = console.error;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    patcher = new ConsolePatcher({
      debugMode: false,
      suppressConsoleOutput: false,
      stderr: true,
    });
    patcher.patch();

    console.error('test error');
    expect(errorSpy).toHaveBeenCalled();

    patcher.cleanup();
    errorSpy.mockRestore();
    console.error = originalError;
  });

  it('should call onNewMessage when stderr is false and not suppressed', () => {
    patcher = new ConsolePatcher({
      debugMode: false,
      suppressConsoleOutput: false,
      stderr: false,
      onNewMessage,
    });
    patcher.patch();

    console.log('test log');
    expect(onNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'log',
        content: 'test log',
      }),
    );

    patcher.cleanup();
  });

  it('should NOT suppress output when suppressConsoleOutput is true but debugMode is true (explicit check)', () => {
    const onNewMessage = vi.fn();
    patcher = new ConsolePatcher({
      debugMode: true,
      suppressConsoleOutput: true,
      stderr: false,
      onNewMessage,
    });
    patcher.patch();

    console.log('test log');

    expect(onNewMessage).toHaveBeenCalled();
    patcher.cleanup();
  });
});
