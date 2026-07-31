/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initializeOutputListenersAndFlush } from './gemini.js';
import { coreEvents, CoreEvent, type Config } from '@google/gemini-cli-core';

// Mock core dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    writeToStdout: vi.fn(),
    writeToStderr: vi.fn(),
  };
});

import { writeToStdout, writeToStderr } from '@google/gemini-cli-core';

describe('Output Redirection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear listeners to simulate a clean state for each test
    coreEvents.removeAllListeners();
  });

  afterEach(() => {
    coreEvents.removeAllListeners();
  });

  it('should redirect buffered stdout to stderr when output format is json', () => {
    const mockConfig = {
      getOutputFormat: () => 'json',
    } as unknown as Config;

    // Simulate buffered output
    coreEvents.emitOutput(false, 'informational message');
    coreEvents.emitOutput(true, 'error message');

    // Initialize listeners and flush
    initializeOutputListenersAndFlush(mockConfig);

    // Verify informational message was forced to stderr
    expect(writeToStderr).toHaveBeenCalledWith(
      'informational message',
      undefined,
    );
    expect(writeToStderr).toHaveBeenCalledWith('error message', undefined);
    expect(writeToStdout).not.toHaveBeenCalled();
  });

  it('should NOT redirect buffered stdout to stderr when output format is NOT json', () => {
    const mockConfig = {
      getOutputFormat: () => 'text',
    } as unknown as Config;

    // Simulate buffered output
    coreEvents.emitOutput(false, 'regular message');

    // Initialize listeners and flush
    initializeOutputListenersAndFlush(mockConfig);

    // Verify regular message went to stdout
    expect(writeToStdout).toHaveBeenCalledWith('regular message', undefined);
    expect(writeToStderr).not.toHaveBeenCalled();
  });

  it('should NOT force stdout to stderr when config is undefined (early init/version)', () => {
    // Simulate buffered output during early init
    coreEvents.emitOutput(false, 'early init message');

    // Initialize with undefined config
    initializeOutputListenersAndFlush(undefined);

    // Verify it went to stdout (default behavior)
    expect(writeToStdout).toHaveBeenCalledWith('early init message', undefined);
    expect(writeToStderr).not.toHaveBeenCalled();
  });

  it('should attach ConsoleLog and UserFeedback listeners even if Output already has one', () => {
    // Manually attach an Output listener
    coreEvents.on(CoreEvent.Output, vi.fn());

    // Initialize - should still attach ConsoleLog and UserFeedback defaults
    initializeOutputListenersAndFlush(undefined);

    // Simulate events
    coreEvents.emitConsoleLog('info', 'stray log');
    coreEvents.emitFeedback('info', 'stray feedback');

    // Draining happens inside initializeOutputListenersAndFlush for existing backlog,
    // but here we check the newly attached listeners for immediate emission.
    expect(writeToStderr).toHaveBeenCalledWith('stray log\n');
    expect(writeToStderr).toHaveBeenCalledWith('stray feedback\n');
  });
});
