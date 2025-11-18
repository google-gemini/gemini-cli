/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKittyKeyboardProtocol } from './useKittyKeyboardProtocol.js';
import * as kittyProtocolDetector from '../utils/kittyProtocolDetector.js';

vi.mock('../utils/kittyProtocolDetector.js');

describe('useKittyKeyboardProtocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return status with all required fields', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      true,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      true,
    );

    const { result } = renderHook(() => useKittyKeyboardProtocol());

    expect(result.current).toHaveProperty('supported');
    expect(result.current).toHaveProperty('enabled');
    expect(result.current).toHaveProperty('checking');
  });

  it('should set supported from isKittyProtocolSupported', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      true,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      false,
    );

    const { result } = renderHook(() => useKittyKeyboardProtocol());

    expect(result.current.supported).toBe(true);
  });

  it('should set enabled from isKittyProtocolEnabled', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      false,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      true,
    );

    const { result } = renderHook(() => useKittyKeyboardProtocol());

    expect(result.current.enabled).toBe(true);
  });

  it('should always set checking to false', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      true,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      true,
    );

    const { result } = renderHook(() => useKittyKeyboardProtocol());

    expect(result.current.checking).toBe(false);
  });

  it('should return false for both when not supported or enabled', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      false,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      false,
    );

    const { result } = renderHook(() => useKittyKeyboardProtocol());

    expect(result.current.supported).toBe(false);
    expect(result.current.enabled).toBe(false);
  });

  it('should call detection functions once on initial render', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      true,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      true,
    );

    renderHook(() => useKittyKeyboardProtocol());

    expect(
      kittyProtocolDetector.isKittyProtocolSupported,
    ).toHaveBeenCalledTimes(1);
    expect(kittyProtocolDetector.isKittyProtocolEnabled).toHaveBeenCalledTimes(
      1,
    );
  });

  it('should cache status and not re-detect on re-render', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      true,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      true,
    );

    const { rerender } = renderHook(() => useKittyKeyboardProtocol());

    rerender();
    rerender();

    // Should still be called only once from initial render
    expect(
      kittyProtocolDetector.isKittyProtocolSupported,
    ).toHaveBeenCalledTimes(1);
    expect(kittyProtocolDetector.isKittyProtocolEnabled).toHaveBeenCalledTimes(
      1,
    );
  });

  it('should return consistent status across re-renders', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      true,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      false,
    );

    const { result, rerender } = renderHook(() => useKittyKeyboardProtocol());

    const initialStatus = result.current;
    rerender();
    const afterRerenderStatus = result.current;

    expect(afterRerenderStatus).toEqual(initialStatus);
  });

  it('should handle supported but not enabled scenario', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      true,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      false,
    );

    const { result } = renderHook(() => useKittyKeyboardProtocol());

    expect(result.current.supported).toBe(true);
    expect(result.current.enabled).toBe(false);
  });

  it('should handle enabled without being supported (edge case)', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      false,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      true,
    );

    const { result } = renderHook(() => useKittyKeyboardProtocol());

    expect(result.current.supported).toBe(false);
    expect(result.current.enabled).toBe(true);
  });

  it('should return object with correct type', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      true,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      true,
    );

    const { result } = renderHook(() => useKittyKeyboardProtocol());

    expect(typeof result.current.supported).toBe('boolean');
    expect(typeof result.current.enabled).toBe('boolean');
    expect(typeof result.current.checking).toBe('boolean');
  });

  it('should not call detection functions with any arguments', () => {
    vi.mocked(kittyProtocolDetector.isKittyProtocolSupported).mockReturnValue(
      true,
    );
    vi.mocked(kittyProtocolDetector.isKittyProtocolEnabled).mockReturnValue(
      true,
    );

    renderHook(() => useKittyKeyboardProtocol());

    expect(kittyProtocolDetector.isKittyProtocolSupported)
      .toHaveBeenCalledWith
      /* no arguments */
      ();
    expect(kittyProtocolDetector.isKittyProtocolEnabled)
      .toHaveBeenCalledWith
      /* no arguments */
      ();
  });
});
