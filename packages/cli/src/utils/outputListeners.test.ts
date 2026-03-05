/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

const coreEventsMocks = vi.hoisted(() => ({
  listenerCount: vi.fn((event: string) => (event === 'output' ? 1 : 0)),
  on: vi.fn(),
  drainBacklogs: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', () => ({
  CoreEvent: {
    Output: 'output',
    ConsoleLog: 'consoleLog',
    UserFeedback: 'userFeedback',
  },
  coreEvents: coreEventsMocks,
  writeToStderr: vi.fn(),
  writeToStdout: vi.fn(),
}));

describe('initializeOutputListenersAndFlush', () => {
  it('registers console/user feedback fallbacks independently of output listeners', async () => {
    const { initializeOutputListenersAndFlush } = await import(
      './outputListeners.js'
    );

    initializeOutputListenersAndFlush();

    expect(coreEventsMocks.listenerCount).toHaveBeenCalledWith('output');
    expect(coreEventsMocks.listenerCount).toHaveBeenCalledWith('consoleLog');
    expect(coreEventsMocks.listenerCount).toHaveBeenCalledWith('userFeedback');

    // Even with existing output listeners, we still add missing fallback listeners.
    expect(coreEventsMocks.on).not.toHaveBeenCalledWith(
      'output',
      expect.any(Function),
    );
    expect(coreEventsMocks.on).toHaveBeenCalledWith(
      'consoleLog',
      expect.any(Function),
    );
    expect(coreEventsMocks.on).toHaveBeenCalledWith(
      'userFeedback',
      expect.any(Function),
    );
    expect(coreEventsMocks.drainBacklogs).toHaveBeenCalled();
  });
});
