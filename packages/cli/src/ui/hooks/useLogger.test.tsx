/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useLogger } from './useLogger.js';
import {
  sessionId as globalSessionId,
  Logger,
  type Storage,
  type Config,
} from '@google/gemini-cli-core';
import { ConfigContext } from '../contexts/ConfigContext.js';
import type React from 'react';

// Mock Logger
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Logger: vi.fn().mockImplementation((id: string) => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      sessionId: id,
    })),
  };
});

describe('useLogger', () => {
  const mockStorage = {} as Storage;
  const mockConfig = {
    getSessionId: vi.fn().mockReturnValue('active-session-id'),
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with the global sessionId by default', async () => {
    const { result } = renderHook(() => useLogger(mockStorage));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(Logger).toHaveBeenCalledWith(globalSessionId, mockStorage);
  });

  it('should initialize with the active sessionId from ConfigContext when available', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ConfigContext.Provider value={mockConfig}>
        {children}
      </ConfigContext.Provider>
    );

    const { result } = renderHook(() => useLogger(mockStorage), { wrapper });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(Logger).toHaveBeenCalledWith('active-session-id', mockStorage);
  });
});
