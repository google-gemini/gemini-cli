/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { useReverseHistorySearch } from './useReverseHistorySearch.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('useReverseHistorySearch', () => {
  const history = ['a', 'b', 'a', 'c', 'a', 'b'];
  const onSearch = vi.fn();

  beforeEach(() => {
    onSearch.mockClear();
  });

  it('should start a search and find the last match', () => {
    const { result } = renderHook(() =>
      useReverseHistorySearch({ history, onSearch }),
    );

    act(() => {
      result.current.startSearch('a');
    });

    expect(result.current.isActive).toBe(true);
    expect(result.current.searchTerm).toBe('a');
    expect(onSearch).toHaveBeenCalledWith('a');
  });

  it('should continue a search and find the next unique match', () => {
    const { result } = renderHook(() =>
      useReverseHistorySearch({ history, onSearch }),
    );

    act(() => {
      result.current.startSearch('a');
    });

    act(() => {
      result.current.continueSearch();
    });

    expect(onSearch).toHaveBeenCalledWith('a');

    act(() => {
      result.current.continueSearch();
    });

    expect(onSearch).toHaveBeenCalledWith('a');
  });

  it('should navigate up and down the history', () => {
    const { result } = renderHook(() =>
      useReverseHistorySearch({ history, onSearch }),
    );

    act(() => {
      result.current.startSearch('a');
    });

    act(() => {
      result.current.navigateUp();
    });

    expect(onSearch).toHaveBeenCalledWith('c');

    act(() => {
      result.current.navigateDown();
    });

    expect(onSearch).toHaveBeenCalledWith('a');
  });

  it('should stop the search', () => {
    const { result } = renderHook(() =>
      useReverseHistorySearch({ history, onSearch }),
    );

    act(() => {
      result.current.startSearch('a');
    });

    act(() => {
      result.current.stopSearch();
    });

    expect(result.current.isActive).toBe(false);
    expect(result.current.searchTerm).toBe(null);
  });
});
