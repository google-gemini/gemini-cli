/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useTerminalSize } from './useTerminalSize.js';
import { useStdout } from 'ink';
import EventEmitter from 'node:events';
import { act } from 'react';

interface MockStdout extends EventEmitter {
  columns?: number;
  rows?: number;
}

vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useStdout: vi.fn(),
  };
});

describe('useTerminalSize', () => {
  let mockStdout: MockStdout;

  beforeEach(() => {
    vi.resetAllMocks();
    mockStdout = new EventEmitter();
    mockStdout.columns = 100;
    mockStdout.rows = 40;
  });

  it('should use dimensions from Ink useStdout when available', async () => {
    vi.mocked(useStdout).mockReturnValue({ stdout: mockStdout });

    const { result } = await renderHook(() => useTerminalSize());

    expect(result.current).toEqual({ columns: 100, rows: 40 });
  });

  it('should fallback to process.stdout if Ink useStdout is not available', async () => {
    vi.mocked(useStdout).mockReturnValue({ stdout: undefined });
    const originalColumns = process.stdout.columns;
    const originalRows = process.stdout.rows;
    Object.defineProperty(process.stdout, 'columns', {
      value: 80,
      writable: true,
    });
    Object.defineProperty(process.stdout, 'rows', {
      value: 24,
      writable: true,
    });

    try {
      const { result } = await renderHook(() => useTerminalSize());
      expect(result.current).toEqual({ columns: 80, rows: 24 });
    } finally {
      Object.defineProperty(process.stdout, 'columns', {
        value: originalColumns,
      });
      Object.defineProperty(process.stdout, 'rows', { value: originalRows });
    }
  });

  it('should update dimensions when resize event is triggered', async () => {
    vi.mocked(useStdout).mockReturnValue({ stdout: mockStdout });

    const { result } = await renderHook(() => useTerminalSize());
    expect(result.current).toEqual({ columns: 100, rows: 40 });

    act(() => {
      mockStdout.columns = 120;
      mockStdout.rows = 50;
      mockStdout.emit('resize');
    });

    expect(result.current).toEqual({ columns: 120, rows: 50 });
  });
});
