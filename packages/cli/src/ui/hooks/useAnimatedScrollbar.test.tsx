/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { useAnimatedScrollbar } from './useAnimatedScrollbar.js';
import { debugState } from '../debug.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const TestComponent = ({ isFocused = false }: { isFocused?: boolean }) => {
  useAnimatedScrollbar(isFocused, () => {});
  return null;
};

describe('useAnimatedScrollbar', () => {
  beforeEach(() => {
    debugState.debugNumAnimatedComponents = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not increment debugNumAnimatedComponents when not focused', () => {
    render(<TestComponent isFocused={false} />);
    expect(debugState.debugNumAnimatedComponents).toBe(0);
  });

  it('should not increment debugNumAnimatedComponents on initial mount even if focused', () => {
    render(<TestComponent isFocused={true} />);
    expect(debugState.debugNumAnimatedComponents).toBe(0);
  });

  it('should increment debugNumAnimatedComponents when becoming focused', () => {
    const { rerender } = render(<TestComponent isFocused={false} />);
    expect(debugState.debugNumAnimatedComponents).toBe(0);
    rerender(<TestComponent isFocused={true} />);
    expect(debugState.debugNumAnimatedComponents).toBe(1);
  });

  it('should decrement debugNumAnimatedComponents when becoming unfocused', () => {
    const { rerender } = render(<TestComponent isFocused={false} />);
    rerender(<TestComponent isFocused={true} />);
    expect(debugState.debugNumAnimatedComponents).toBe(1);
    rerender(<TestComponent isFocused={false} />);
    expect(debugState.debugNumAnimatedComponents).toBe(0);
  });

  it('should decrement debugNumAnimatedComponents on unmount', () => {
    const { rerender, unmount } = render(<TestComponent isFocused={false} />);
    rerender(<TestComponent isFocused={true} />);
    expect(debugState.debugNumAnimatedComponents).toBe(1);
    unmount();
    expect(debugState.debugNumAnimatedComponents).toBe(0);
  });

  it('should decrement debugNumAnimatedComponents after animation finishes', async () => {
    const { rerender } = render(<TestComponent isFocused={false} />);
    rerender(<TestComponent isFocused={true} />);
    expect(debugState.debugNumAnimatedComponents).toBe(1);

    // Advance timers by enough time for animation to complete (200 + 1000 + 300 + buffer)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(debugState.debugNumAnimatedComponents).toBe(0);
  });
});
