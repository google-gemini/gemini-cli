/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupUnhandledRejectionHandler } from './gemini.js';
import { debugLogger } from '@google/gemini-cli-core';

describe('setupUnhandledRejectionHandler - uncaughtException', () => {
  let initialUncaughtExceptionListeners: readonly unknown[] = [];

  beforeEach(() => {
    initialUncaughtExceptionListeners = process.listeners('uncaughtException');
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    const currentListeners = process.listeners('uncaughtException');
    currentListeners.forEach((listener) => {
      if (!initialUncaughtExceptionListeners.includes(listener)) {
        process.removeListener('uncaughtException', listener);
      }
    });
    vi.restoreAllMocks();
  });

  it('should suppress uncaught AbortError', async () => {
    const debugLoggerErrorSpy = vi.spyOn(debugLogger, 'error');
    const debugLoggerLogSpy = vi.spyOn(debugLogger, 'log');
    
    const abortError = new DOMException(
      'The operation was aborted.',
      'AbortError',
    );

    // Call setupUnhandledRejectionHandler to register the listeners under test
    setupUnhandledRejectionHandler();

    // Trigger the uncaughtException listener manually
    process.emit('uncaughtException', abortError);

    // Give asynchronous tasks a tick to execute if any
    await new Promise(process.nextTick);

    // Expect that the error was suppressed, so debugLogger.error was NOT called
    // and instead debugLogger.log was called with the suppression log message.
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Suppressed uncaught AbortError'),
    );
  });
});
