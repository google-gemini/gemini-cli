/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTerminalSize } from './useTerminalSize.js';

describe('useTerminalSize', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return initial terminal size', () => {
    const { result } = renderHook(() => useTerminalSize());

    expect(result.current).toHaveProperty('columns');
    expect(result.current).toHaveProperty('rows');
    expect(typeof result.current.columns).toBe('number');
    expect(typeof result.current.rows).toBe('number');
  });

  it('should use default values when stdout dimensions are not available', () => {
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(undefined);
    vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(undefined);

    const { result } = renderHook(() => useTerminalSize());

    // Default columns: 60 - 8 (padding) = 52
    expect(result.current.columns).toBe(52);
    // Default rows: 20
    expect(result.current.rows).toBe(20);
  });

  it('should calculate columns with padding subtracted', () => {
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(100);
    vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(30);

    const { result } = renderHook(() => useTerminalSize());

    // Columns should be stdout.columns - 8 (TERMINAL_PADDING_X)
    expect(result.current.columns).toBe(92);
    expect(result.current.rows).toBe(30);
  });

  it('should use rows directly without padding', () => {
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(80);
    vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(24);

    const { result } = renderHook(() => useTerminalSize());

    expect(result.current.rows).toBe(24);
  });

  it('should update size on terminal resize', () => {
    const mockOn = vi.fn();
    const mockOff = vi.fn();

    vi.spyOn(process.stdout, 'on').mockImplementation(mockOn);
    vi.spyOn(process.stdout, 'off').mockImplementation(mockOff);
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(80);
    vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(24);

    renderHook(() => useTerminalSize());

    expect(mockOn).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('should clean up resize listener on unmount', () => {
    const mockOn = vi.fn();
    const mockOff = vi.fn();
    let resizeCallback: (() => void) | undefined;

    vi.spyOn(process.stdout, 'on').mockImplementation((event, callback) => {
      if (event === 'resize') {
        resizeCallback = callback as () => void;
      }
      return mockOn(event, callback);
    });
    vi.spyOn(process.stdout, 'off').mockImplementation(mockOff);

    const { unmount } = renderHook(() => useTerminalSize());

    unmount();

    expect(mockOff).toHaveBeenCalledWith('resize', resizeCallback);
  });

  it('should handle very small terminal sizes', () => {
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(20);
    vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(10);

    const { result } = renderHook(() => useTerminalSize());

    // 20 - 8 = 12
    expect(result.current.columns).toBe(12);
    expect(result.current.rows).toBe(10);
  });

  it('should handle large terminal sizes', () => {
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(200);
    vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(100);

    const { result } = renderHook(() => useTerminalSize());

    // 200 - 8 = 192
    expect(result.current.columns).toBe(192);
    expect(result.current.rows).toBe(100);
  });

  it('should return positive numbers', () => {
    const { result } = renderHook(() => useTerminalSize());

    expect(result.current.columns).toBeGreaterThan(0);
    expect(result.current.rows).toBeGreaterThan(0);
  });

  it('should handle terminal with only columns defined', () => {
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(100);
    vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(undefined);

    const { result } = renderHook(() => useTerminalSize());

    expect(result.current.columns).toBe(92);
    expect(result.current.rows).toBe(20); // default
  });

  it('should handle terminal with only rows defined', () => {
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(undefined);
    vi.spyOn(process.stdout, 'rows', 'get').mockReturnValue(30);

    const { result } = renderHook(() => useTerminalSize());

    expect(result.current.columns).toBe(52); // default 60 - 8
    expect(result.current.rows).toBe(30);
  });

  it('should apply TERMINAL_PADDING_X of 8', () => {
    vi.spyOn(process.stdout, 'columns', 'get').mockReturnValue(100);

    const { result } = renderHook(() => useTerminalSize());

    const expectedColumns = 100 - 8;
    expect(result.current.columns).toBe(expectedColumns);
  });
});
