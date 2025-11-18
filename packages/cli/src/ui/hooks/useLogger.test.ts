/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLogger } from './useLogger.js';
import { Logger } from '@google/gemini-cli-core';
import type { Storage } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    Logger: vi.fn(),
    sessionId: 'test-session-id',
  };
});

describe('useLogger', () => {
  let mockStorage: Storage;
  let mockLogger: {
    initialize: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockStorage = {} as Storage;
    mockLogger = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(Logger).mockImplementation(() => mockLogger as never);
  });

  it('should return null initially', () => {
    const { result } = renderHook(() => useLogger(mockStorage));

    expect(result.current).toBeNull();
  });

  it('should create Logger instance with sessionId and storage', () => {
    renderHook(() => useLogger(mockStorage));

    expect(Logger).toHaveBeenCalledWith('test-session-id', mockStorage);
  });

  it('should initialize logger asynchronously', async () => {
    renderHook(() => useLogger(mockStorage));

    await waitFor(() => {
      expect(mockLogger.initialize).toHaveBeenCalled();
    });
  });

  it('should set logger after initialization succeeds', async () => {
    const { result } = renderHook(() => useLogger(mockStorage));

    await waitFor(() => {
      expect(result.current).toBe(mockLogger);
    });
  });

  it('should handle initialization errors gracefully', async () => {
    mockLogger.initialize.mockRejectedValue(new Error('Init failed'));

    const { result } = renderHook(() => useLogger(mockStorage));

    // Should not throw, logger should remain null
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current).toBeNull();
  });

  it('should recreate logger when storage changes', async () => {
    const storage1: Storage = { type: 'storage1' } as never;
    const storage2: Storage = { type: 'storage2' } as never;

    const { rerender } = renderHook(({ storage }) => useLogger(storage), {
      initialProps: { storage: storage1 },
    });

    await waitFor(() => {
      expect(mockLogger.initialize).toHaveBeenCalledTimes(1);
    });

    rerender({ storage: storage2 });

    await waitFor(() => {
      expect(Logger).toHaveBeenCalledTimes(2);
      expect(Logger).toHaveBeenLastCalledWith('test-session-id', storage2);
    });
  });

  it('should not recreate logger if storage reference stays the same', async () => {
    const { rerender } = renderHook(() => useLogger(mockStorage));

    await waitFor(() => {
      expect(Logger).toHaveBeenCalledTimes(1);
    });

    rerender();

    // Should still be called only once
    expect(Logger).toHaveBeenCalledTimes(1);
  });

  it('should handle rapid storage changes', async () => {
    const storage1: Storage = { id: 1 } as never;
    const storage2: Storage = { id: 2 } as never;
    const storage3: Storage = { id: 3 } as never;

    const { rerender } = renderHook(({ storage }) => useLogger(storage), {
      initialProps: { storage: storage1 },
    });

    rerender({ storage: storage2 });
    rerender({ storage: storage3 });

    await waitFor(() => {
      expect(Logger).toHaveBeenCalledTimes(3);
    });
  });

  it('should initialize logger without awaiting', () => {
    renderHook(() => useLogger(mockStorage));

    // initialize should be called immediately but not awaited
    expect(mockLogger.initialize).toHaveBeenCalled();
  });

  it('should handle initialization timing correctly', async () => {
    let resolveInit: (() => void) | undefined;
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve;
    });
    mockLogger.initialize.mockReturnValue(initPromise);

    const { result } = renderHook(() => useLogger(mockStorage));

    // Logger should be null while initializing
    expect(result.current).toBeNull();

    resolveInit!();

    // After init completes, logger should be set
    await waitFor(() => {
      expect(result.current).toBe(mockLogger);
    });
  });

  it('should use the same sessionId across invocations', () => {
    const { unmount: unmount1 } = renderHook(() => useLogger(mockStorage));
    unmount1();

    renderHook(() => useLogger(mockStorage));

    expect(Logger).toHaveBeenCalledWith('test-session-id', expect.anything());
  });
});
