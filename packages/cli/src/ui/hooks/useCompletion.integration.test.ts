/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCompletion } from './useCompletion.js';
import * as atFileCompleter from './atFileCompleter.js';

vi.mock('./atFileCompleter.js', () => ({
  getAtFileSuggestions: vi.fn(),
}));

describe('useCompletion simplified integration test', () => {
  const testCwd = '/test/project';
  const slashCommands = [
    { name: 'help', description: 'Show help', action: vi.fn() },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call getAtFileSuggestions and update state', async () => {
    const mockSuggestions = [{ label: 'file.txt', value: 'file.txt' }];
    vi.mocked(atFileCompleter.getAtFileSuggestions).mockResolvedValue(
      mockSuggestions,
    );

    const { result } = renderHook(() =>
      useCompletion('@file', testCwd, true, slashCommands, undefined),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150)); // Debounce
    });

    expect(atFileCompleter.getAtFileSuggestions).toHaveBeenCalledWith(
      'file',
      testCwd,
    );
    expect(result.current.suggestions).toEqual(mockSuggestions);
    expect(result.current.showSuggestions).toBe(true);
  });

  it('should handle errors from getAtFileSuggestions gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(atFileCompleter.getAtFileSuggestions).mockRejectedValue(
      new Error('Test error'),
    );

    const { result } = renderHook(() =>
      useCompletion('@error', testCwd, true, slashCommands, undefined),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.showSuggestions).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      'Error fetching completion suggestions for @error: Test error',
    );
    consoleSpy.mockRestore();
  });
});
