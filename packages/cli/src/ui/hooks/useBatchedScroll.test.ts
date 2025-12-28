/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useBatchedScroll } from './useBatchedScroll.js';

describe('useBatchedScroll', () => {
  it('returns initial scrollTop', () => {
    const { result } = renderHook(() => useBatchedScroll(10));
    expect(result.current.getScrollTop()).toBe(10);
  });

  it('returns updated scrollTop from props', () => {
    let currentScrollTop = 10;
    const { result, rerender } = renderHook(() =>
      useBatchedScroll(currentScrollTop),
    );

    expect(result.current.getScrollTop()).toBe(10);

    currentScrollTop = 100;
    rerender();

    expect(result.current.getScrollTop()).toBe(100);
  });

  it('returns pending scrollTop when set', () => {
    const { result } = renderHook(() => useBatchedScroll(10));

    result.current.setPendingScrollTop(50);
    expect(result.current.getScrollTop()).toBe(50);
  });

  it('overwrites pending scrollTop with subsequent sets before render', () => {
    const { result } = renderHook(() => useBatchedScroll(10));

    result.current.setPendingScrollTop(50);
    result.current.setPendingScrollTop(75);
    expect(result.current.getScrollTop()).toBe(75);
  });

  it('resets pending scrollTop after rerender', () => {
    let currentScrollTop = 10;
    const { result, rerender } = renderHook(() =>
      useBatchedScroll(currentScrollTop),
    );

    result.current.setPendingScrollTop(50);
    expect(result.current.getScrollTop()).toBe(50);

    // Rerender with new prop
    currentScrollTop = 100;
    rerender();

    // Should now be the new prop value, pending should be cleared
    expect(result.current.getScrollTop()).toBe(100);
  });

  it('resets pending scrollTop after rerender even if prop is same', () => {
    const { result, rerender } = renderHook(() => useBatchedScroll(10));

    result.current.setPendingScrollTop(50);
    expect(result.current.getScrollTop()).toBe(50);

    // Rerender with same prop
    rerender();

    // Pending should still be cleared because useEffect runs after every render
    expect(result.current.getScrollTop()).toBe(10);
  });

  it('maintains stable function references', () => {
    const { result, rerender } = renderHook(() => useBatchedScroll(10));
    const initialGetScrollTop = result.current.getScrollTop;
    const initialSetPendingScrollTop = result.current.setPendingScrollTop;

    rerender();

    expect(result.current.getScrollTop).toBe(initialGetScrollTop);
    expect(result.current.setPendingScrollTop).toBe(initialSetPendingScrollTop);
  });
});
