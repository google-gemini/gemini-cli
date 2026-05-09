/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useLogger } from './useLogger.js';
import { Logger, type Storage, type Config } from '@google/gemini-cli-core';

let deferredInit: { resolve: (val?: unknown) => void };

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
            deferredInit = { resolve };
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
  });

  it('should initialize with the sessionId from config', async () => {
    const { result } = await renderHook(() => useLogger(mockConfig));

    expect(result.current).toBeNull();

    await act(async () => {
      deferredInit.resolve();
    });

    expect(result.current).not.toBeNull();
    expect(Logger).toHaveBeenCalledWith('active-session-id', mockStorage);
  });
});
