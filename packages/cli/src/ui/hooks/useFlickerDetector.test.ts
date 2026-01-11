/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config, recordFlickerFrame } from '@google/gemini-cli-core';
import { type DOMElement, measureElement } from 'ink';
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { AppEvent, appEvents } from '../../utils/events.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useFlickerDetector } from './useFlickerDetector.js';

// Grace period frames to skip before flicker detection activates
const STARTUP_GRACE_FRAMES = 50;

// Mock dependencies
vi.mock('../contexts/ConfigContext.js');
vi.mock('../contexts/UIStateContext.js');
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    recordFlickerFrame: vi.fn(),
    GEMINI_DIR: '.gemini',
  };
});
vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    measureElement: vi.fn(),
  };
});
vi.mock('../../utils/events.js', () => ({
  appEvents: {
    emit: vi.fn(),
  },
  AppEvent: {
    Flicker: 'flicker',
  },
}));

const mockUseConfig = useConfig as Mock;
const mockUseUIState = useUIState as Mock;
const mockRecordFlickerFrame = recordFlickerFrame as Mock;
const mockMeasureElement = measureElement as Mock;
const mockAppEventsEmit = appEvents.emit as Mock;

describe('useFlickerDetector', () => {
  const mockConfig = {} as Config;
  let mockRef: React.RefObject<DOMElement | null>;

  beforeEach(() => {
    mockUseConfig.mockReturnValue(mockConfig);
    mockRef = { current: { yogaNode: {} } as DOMElement };
    // Default UI state
    mockUseUIState.mockReturnValue({ constrainHeight: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not record a flicker during grace period', () => {
    mockMeasureElement.mockReturnValue({ width: 80, height: 30 });
    // First render is within grace period, so no flicker should be recorded
    renderHook(() => useFlickerDetector(mockRef, 25));
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
    expect(mockAppEventsEmit).not.toHaveBeenCalled();
  });

  it('should not record a flicker when height is less than terminal height after grace period', () => {
    mockMeasureElement.mockReturnValue({ width: 80, height: 20 });
    const { rerender } = renderHook(() => useFlickerDetector(mockRef, 25));
    // Skip grace period
    for (let i = 0; i < STARTUP_GRACE_FRAMES; i++) {
      rerender();
    }
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
    expect(mockAppEventsEmit).not.toHaveBeenCalled();
  });

  it('should not record a flicker when height is equal to terminal height after grace period', () => {
    mockMeasureElement.mockReturnValue({ width: 80, height: 25 });
    const { rerender } = renderHook(() => useFlickerDetector(mockRef, 25));
    // Skip grace period
    for (let i = 0; i < STARTUP_GRACE_FRAMES; i++) {
      rerender();
    }
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
    expect(mockAppEventsEmit).not.toHaveBeenCalled();
  });

  it('should record a flicker when height is greater than terminal height after grace period', () => {
    mockMeasureElement.mockReturnValue({ width: 80, height: 30 });
    const { rerender } = renderHook(() => useFlickerDetector(mockRef, 25));
    // Skip grace period
    for (let i = 0; i < STARTUP_GRACE_FRAMES; i++) {
      rerender();
    }
    expect(mockRecordFlickerFrame).toHaveBeenCalledTimes(1);
    expect(mockRecordFlickerFrame).toHaveBeenCalledWith(mockConfig);
    expect(mockAppEventsEmit).toHaveBeenCalledTimes(1);
    expect(mockAppEventsEmit).toHaveBeenCalledWith(AppEvent.Flicker);
  });

  it('should NOT record a flicker when height is greater but height is NOT constrained', () => {
    // Override default UI state for this test
    mockUseUIState.mockReturnValue({ constrainHeight: false });
    mockMeasureElement.mockReturnValue({ width: 80, height: 30 });
    const { rerender } = renderHook(() => useFlickerDetector(mockRef, 25));
    // Skip grace period
    for (let i = 0; i < STARTUP_GRACE_FRAMES; i++) {
      rerender();
    }
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
    expect(mockAppEventsEmit).not.toHaveBeenCalled();
  });

  it('should not check for flicker if the ref is not set', () => {
    mockRef.current = null;
    mockMeasureElement.mockReturnValue({ width: 80, height: 30 });
    const { rerender } = renderHook(() => useFlickerDetector(mockRef, 25));
    // Skip grace period
    for (let i = 0; i < STARTUP_GRACE_FRAMES; i++) {
      rerender();
    }
    expect(mockMeasureElement).not.toHaveBeenCalled();
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();
    expect(mockAppEventsEmit).not.toHaveBeenCalled();
  });

  it('should re-evaluate on re-render after grace period', () => {
    // Start with a valid height
    mockMeasureElement.mockReturnValue({ width: 80, height: 20 });
    const { rerender } = renderHook(() => useFlickerDetector(mockRef, 25));

    // Skip grace period
    for (let i = 0; i < STARTUP_GRACE_FRAMES; i++) {
      rerender();
    }
    expect(mockRecordFlickerFrame).not.toHaveBeenCalled();

    // Now, simulate a re-render where the height is too great
    mockMeasureElement.mockReturnValue({ width: 80, height: 30 });
    rerender();

    expect(mockRecordFlickerFrame).toHaveBeenCalledTimes(1);
    expect(mockAppEventsEmit).toHaveBeenCalledTimes(1);
  });
});
