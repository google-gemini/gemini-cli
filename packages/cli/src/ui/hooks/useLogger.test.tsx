/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useLogger } from './useLogger.js';
import {
  Logger,
  uiTelemetryService,
  type Storage,
  type Config,
} from '@google/gemini-cli-core';

const deferredInits: Array<{ resolve: (val?: unknown) => void }> = [];
let unmounts: Array<() => void> = [];

// Mock Logger
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Logger: vi.fn().mockImplementation((id: string) => ({
      initialize: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            deferredInits.push({ resolve });
          }),
      ),
      sessionId: id,
    })),
  };
});

describe('useLogger', () => {
  const mockStorage = {} as Storage;
  const mockConfig = {
    getSessionId: vi.fn().mockReturnValue('active-session-id'),
    storage: mockStorage,
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
    deferredInits.length = 0;
  });

  afterEach(() => {
    for (const unmount of unmounts) {
      unmount();
    }
    unmounts = [];
  });

  it('should initialize with the sessionId from config', async () => {
    const { result, unmount } = await renderHook(() => useLogger(mockConfig));
    unmounts.push(unmount);

    expect(result.current).toBeNull();

    await act(async () => {
      deferredInits[0].resolve();
    });

    expect(result.current).not.toBeNull();
    expect(Logger).toHaveBeenCalledWith('active-session-id', mockStorage);
  });

  it('should reinitialize when the session is cleared', async () => {
    const { result, unmount } = await renderHook(() => useLogger(mockConfig));
    unmounts.push(unmount);

    await act(async () => {
      deferredInits[0].resolve();
    });

    const activeLogger = result.current;
    expect(activeLogger).not.toBeNull();

    await act(async () => {
      uiTelemetryService.clear('new-session-id');
    });

    expect(Logger).toHaveBeenCalledWith('new-session-id', mockStorage);
    expect(result.current).toBe(activeLogger);

    await act(async () => {
      deferredInits[1].resolve();
    });

    expect(result.current).not.toBe(activeLogger);
  });
});
