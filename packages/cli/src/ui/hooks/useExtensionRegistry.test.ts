/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useExtensionRegistry } from './useExtensionRegistry.js';
import {
  ExtensionRegistryClient,
  type RegistryExtension,
} from '../../config/extensionRegistryClient.js';
import { act } from 'react';

vi.mock('../../config/extensionRegistryClient.js');

const mockExtensions = [
  {
    id: 'ext-1',
    extensionName: 'Extension 1',
    extensionDescription: 'Description 1',
  },
  {
    id: 'ext-2',
    extensionName: 'Extension 2',
    extensionDescription: 'Description 2',
  },
] as RegistryExtension[];

describe('useExtensionRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should fetch extensions on mount', async () => {
    vi.spyOn(
      ExtensionRegistryClient.prototype,
      'searchExtensions',
    ).mockResolvedValue(mockExtensions);

    const { result } = renderHook(() => useExtensionRegistry());

    expect(result.current.loading).toBe(true);
    expect(result.current.extensions).toEqual([]);

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.extensions).toEqual(mockExtensions);
    expect(
      ExtensionRegistryClient.prototype.searchExtensions,
    ).toHaveBeenCalledWith('');
  });

  it('should handle search with debounce', async () => {
    vi.spyOn(
      ExtensionRegistryClient.prototype,
      'searchExtensions',
    ).mockResolvedValue(mockExtensions);

    const { result } = renderHook(() => useExtensionRegistry());

    await act(async () => {
      await Promise.resolve();
    });

    // Initial load done
    expect(
      ExtensionRegistryClient.prototype.searchExtensions,
    ).toHaveBeenCalledTimes(1);

    // Search
    act(() => {
      result.current.search('test');
    });

    // Should not happen immediately due to debounce
    expect(
      ExtensionRegistryClient.prototype.searchExtensions,
    ).toHaveBeenCalledTimes(1);

    // Advance time
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve(); // Allow potential async effects to run
    });

    expect(
      ExtensionRegistryClient.prototype.searchExtensions,
    ).toHaveBeenCalledTimes(2);
    expect(
      ExtensionRegistryClient.prototype.searchExtensions,
    ).toHaveBeenCalledWith('test');
  });

  it('should handle race conditions by ignoring outdated responses', async () => {
    // Setup a delayed response for the first query 'a'
    let resolveA: (value: RegistryExtension[]) => void;
    const promiseA = new Promise<RegistryExtension[]>((resolve) => {
      resolveA = resolve;
    });

    // Immediate response for query 'b'
    const responseB = [mockExtensions[1]];

    vi.spyOn(
      ExtensionRegistryClient.prototype,
      'searchExtensions',
    ).mockImplementation(async (query) => {
      if (query === 'a') return promiseA;
      if (query === 'b') return responseB;
      return [];
    });

    const { result } = renderHook(() => useExtensionRegistry(''));

    await act(async () => {
      await Promise.resolve(); // Initial load empty
    });

    // Search 'a'
    act(() => {
      result.current.search('a');
      vi.advanceTimersByTime(300);
    });

    // Search 'b' immediately after (conceptually, though heavily simplified test here)
    // Actually, to test race condition:
    // 1. Trigger search 'a'.
    // 2. Trigger search 'b'.
    // 3. 'b' resolves.
    // 4. 'a' resolves later.
    // 5. State should match 'b'.

    act(() => {
      result.current.search('b');
      vi.advanceTimersByTime(300);
    });

    await act(async () => {
      await Promise.resolve(); // 'b' resolves immediately
    });

    expect(result.current.extensions).toEqual(responseB);

    // Now resolve 'a'
    await act(async () => {
      resolveA!(mockExtensions);
      await Promise.resolve();
    });

    // Should still be 'b' because 'a' was outdated
    expect(result.current.extensions).toEqual(responseB);
  });

  it('should not update state if extensions are identical', async () => {
    vi.spyOn(
      ExtensionRegistryClient.prototype,
      'searchExtensions',
    ).mockResolvedValue(mockExtensions);

    const { result } = renderHook(() => useExtensionRegistry());

    await act(async () => {
      await Promise.resolve();
    });

    const initialExtensions = result.current.extensions;

    // Trigger another search that returns identical content
    act(() => {
      result.current.search('test');
      vi.advanceTimersByTime(300);
    });

    await act(async () => {
      await Promise.resolve();
    });

    // The reference should be exactly the same
    expect(result.current.extensions).toBe(initialExtensions);
  });
});
