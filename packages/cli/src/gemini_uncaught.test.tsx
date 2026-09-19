/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupUnhandledRejectionHandler } from './gemini.js';
import { debugLogger } from '@google/gemini-cli-core';

vi.mock('./utils/cleanup.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/cleanup.js')>();
  return {
    ...actual,
    runExitCleanup: vi.fn().mockResolvedValue(undefined),
  };
});

describe('setupUnhandledRejectionHandler - uncaughtException', () => {
  let initialUncaughtExceptionListeners: readonly unknown[] = [];
  let initialUnhandledRejectionListeners: readonly unknown[] = [];
  let originalExitCode: number | undefined;

  beforeEach(() => {
    initialUncaughtExceptionListeners = process.listeners('uncaughtException');
    initialUnhandledRejectionListeners =
      process.listeners('unhandledRejection');
    originalExitCode = process.exitCode;
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(process, 'removeAllListeners').mockImplementation(() => process);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    const currentUncaughtListeners = process.listeners('uncaughtException');
    currentUncaughtListeners.forEach((listener) => {
      if (!initialUncaughtExceptionListeners.includes(listener)) {
        process.removeListener('uncaughtException', listener);
      }
    });

    const currentUnhandledListeners = process.listeners('unhandledRejection');
    currentUnhandledListeners.forEach((listener) => {
      if (!initialUnhandledRejectionListeners.includes(listener)) {
        process.removeListener('unhandledRejection', listener);
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

    // Retrieve the registered geminiListener directly and invoke it
    const listeners = process.listeners('uncaughtException');
    const geminiListener = listeners.find(
      (l) =>
        Object.getOwnPropertyDescriptor(l, 'geminiListener')?.value === true,
    );
    expect(geminiListener).toBeDefined();

    // Directly invoke the synchronous listener
    (geminiListener as (error: unknown) => void)(abortError);

    // Expect that the error was suppressed, so debugLogger.error was NOT called
    // and instead debugLogger.log was called with the suppression log message.
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Suppressed uncaught AbortError'),
    );
  });

  it('should format non-Error objects safely', async () => {
    const debugLoggerErrorSpy = vi.spyOn(debugLogger, 'error');

    // Call setupUnhandledRejectionHandler to register the listeners under test
    setupUnhandledRejectionHandler();

    const listeners = process.listeners('uncaughtException');
    const geminiListener = listeners.find(
      (l) =>
        Object.getOwnPropertyDescriptor(l, 'geminiListener')?.value === true,
    );
    expect(geminiListener).toBeDefined();

    const plainObjectError = { foo: 'bar', details: 123 };
    (geminiListener as (error: unknown) => void)(plainObjectError);

    // Flush the microtask queue to allow the async cleanup to run
    await new Promise((resolve) => process.nextTick(resolve));

    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('{"foo":"bar","details":123}'),
    );
  });

  it('should format unserializable objects safely', async () => {
    const debugLoggerErrorSpy = vi.spyOn(debugLogger, 'error');

    // Call setupUnhandledRejectionHandler to register the listeners under test
    setupUnhandledRejectionHandler();

    const listeners = process.listeners('uncaughtException');
    const geminiListener = listeners.find(
      (l) =>
        Object.getOwnPropertyDescriptor(l, 'geminiListener')?.value === true,
    );
    expect(geminiListener).toBeDefined();

    // Create a circular reference object
    const circularObj: Record<string, unknown> = {};
    circularObj['self'] = circularObj;

    (geminiListener as (error: unknown) => void)(circularObj);

    // Flush the microtask queue to allow the async cleanup to run
    await new Promise((resolve) => process.nextTick(resolve));

    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Unserializable Object]'),
    );
  });
});
