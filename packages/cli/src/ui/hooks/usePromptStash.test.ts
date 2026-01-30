/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { usePromptStash } from './usePromptStash.js';

describe('usePromptStash', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with no stashed prompt', () => {
    const { result } = renderHook(() => usePromptStash());
    expect(result.current.stashedPrompt).toBeNull();
    expect(result.current.hasStash).toBe(false);
  });

  it('should stash a prompt successfully', () => {
    const { result } = renderHook(() => usePromptStash());

    act(() => {
      const success = result.current.stash('test prompt');
      expect(success).toBe(true);
    });

    expect(result.current.stashedPrompt).toBe('test prompt');
    expect(result.current.hasStash).toBe(true);
  });

  it('should trim whitespace when stashing', () => {
    const { result } = renderHook(() => usePromptStash());

    act(() => {
      result.current.stash('  test prompt  ');
    });

    expect(result.current.stashedPrompt).toBe('test prompt');
  });

  it('should not stash empty input', () => {
    const { result } = renderHook(() => usePromptStash());

    act(() => {
      const success = result.current.stash('');
      expect(success).toBe(false);
    });

    expect(result.current.hasStash).toBe(false);
  });

  it('should not stash whitespace-only input', () => {
    const { result } = renderHook(() => usePromptStash());

    act(() => {
      const success = result.current.stash('   ');
      expect(success).toBe(false);
    });

    expect(result.current.hasStash).toBe(false);
  });

  it('should pop and clear the stashed prompt', () => {
    const { result } = renderHook(() => usePromptStash());

    act(() => {
      result.current.stash('my prompt');
    });

    let popped: string | null = null;
    act(() => {
      popped = result.current.pop();
    });

    expect(popped).toBe('my prompt');
    expect(result.current.stashedPrompt).toBeNull();
    expect(result.current.hasStash).toBe(false);
  });

  it('should return null when popping with nothing stashed', () => {
    const { result } = renderHook(() => usePromptStash());

    let popped: string | null = 'initial';
    act(() => {
      popped = result.current.pop();
    });

    expect(popped).toBeNull();
  });

  it('should overwrite previous stash when stashing again', () => {
    const { result } = renderHook(() => usePromptStash());

    act(() => {
      result.current.stash('first');
      result.current.stash('second');
    });

    expect(result.current.stashedPrompt).toBe('second');
  });

  it('should clear the stash without returning', () => {
    const { result } = renderHook(() => usePromptStash());

    act(() => {
      result.current.stash('to be cleared');
      result.current.clear();
    });

    expect(result.current.stashedPrompt).toBeNull();
    expect(result.current.hasStash).toBe(false);
  });

  it('should preserve stash across multiple pops after re-stashing', () => {
    const { result } = renderHook(() => usePromptStash());

    act(() => {
      result.current.stash('first stash');
    });

    let popped: string | null = null;
    act(() => {
      popped = result.current.pop();
    });
    expect(popped).toBe('first stash');

    act(() => {
      result.current.stash('second stash');
    });

    act(() => {
      popped = result.current.pop();
    });
    expect(popped).toBe('second stash');
  });
});
