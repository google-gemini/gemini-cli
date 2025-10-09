/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { useFlickerDetector } from './useFlickerDetector.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { recordFlickerFrame } from '@google/gemini-cli-core';
import { type Config } from '@google/gemini-cli-core';
import { type DOMElement, measureElement } from 'ink';

// Mock dependencies
vi.mock('../contexts/ConfigContext.js');
vi.mock('@google/gemini-cli-core', () => ({
  recordFlickerFrame: vi.fn(),
}));
vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    measureElement: vi.fn(),
  };
});

const mockUseConfig = useConfig as Mock;
const mockRecordFlickerFrame = recordFlickerFrame as Mock;
const mockMeasureElement = measureElement as Mock;

describe('useFlickerDetector', () => {
  const mockConfig = {} as Config; // Mock config object
  let mockRef: React.RefObject<DOMElement | null>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockUseConfig.mockReturnValue(mockConfig);
    mockRef = { current: { yogaNode: {} } as DOMElement }; // Mock DOM element
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should not record a flicker frame when height is less than terminal height', () => {
    mockMeasureElement.mockReturnValue({ width: 80, height: 20 });

    renderHook(() => useFlickerDetector(mockRef, 25));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
  });

  it('should not record a flicker frame when height is equal to terminal height', () => {
    mockMeasureElement.mockReturnValue({ width: 80, height: 25 });

    renderHook(() => useFlickerDetector(mockRef, 25));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
  });

  it('should record a flicker frame when height is greater than terminal height', () => {
    mockMeasureElement.mockReturnValue({ width: 80, height: 30 });

    renderHook(() => useFlickerDetector(mockRef, 25));

    act(() => {
      vi.advanceTimersByTime(250); // Advance to the first interval
    });

    expect(mockRecordFlickerFrame).toHaveBeenCalledTimes(1);
    expect(mockRecordFlickerFrame).toHaveBeenCalledWith(mockConfig);

    act(() => {
      vi.advanceTimersByTime(250); // Advance to the second interval
    });

    expect(mockRecordFlickerFrame).toHaveBeenCalledTimes(2);
  });

  it('should not check for flicker if the ref is not set', () => {
    mockRef.current = null;
    mockMeasureElement.mockReturnValue({ width: 80, height: 30 });

    renderHook(() => useFlickerDetector(mockRef, 25));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockMeasureElement).not.toHaveBeenCalled();
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
  });

  it('should clean up the interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    mockMeasureElement.mockReturnValue({ width: 80, height: 20 });

    const { unmount } = renderHook(() => useFlickerDetector(mockRef, 25));

    // Timer is set on mount
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    unmount();

    // Timer is cleared on unmount
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
