/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { appEvents, AppEvent } from '../../utils/events.js';
import {
  profiler,
  DebugProfiler,
  ACTION_TIMESTAMP_CAPACITY,
  FRAME_TIMESTAMP_CAPACITY,
} from './DebugProfiler.js';
import { render } from '../../test-utils/render.js';
import { useUIState, type UIState } from '../contexts/UIStateContext.js';
import { FixedDeque } from 'mnemonist';
import { debugState } from '../debug.js';

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(),
}));

describe('DebugProfiler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    profiler.profilersActive = 1;
    profiler.numFrames = 0;
    profiler.totalIdleFrames = 0;
    profiler.lastFrameStartTime = 0;
    profiler.openedDebugConsole = false;
    profiler.lastActionTimestamp = 0;
    profiler.possiblyIdleFrameTimestamps = new FixedDeque<number>(
      Array,
      FRAME_TIMESTAMP_CAPACITY,
    );
    profiler.actionTimestamps = new FixedDeque<number>(
      Array,
      ACTION_TIMESTAMP_CAPACITY,
    );
    debugState.debugNumAnimatedComponents = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    profiler.actionTimestamps.clear();
    profiler.possiblyIdleFrameTimestamps.clear();
    debugState.debugNumAnimatedComponents = 0;
  });

  it('should not exceed action timestamp capacity', () => {
    for (let i = 0; i < ACTION_TIMESTAMP_CAPACITY + 10; i++) {
      profiler.reportAction();
      // To ensure we don't trigger the debounce
      profiler.lastActionTimestamp = 0;
    }
    expect(profiler.actionTimestamps.size).toBe(ACTION_TIMESTAMP_CAPACITY);
  });

  it('should not exceed frame timestamp capacity', () => {
    for (let i = 0; i < FRAME_TIMESTAMP_CAPACITY + 10; i++) {
      profiler.reportFrameRendered();
      // To ensure we don't trigger the debounce
      profiler.lastFrameStartTime = 0;
    }
    expect(profiler.possiblyIdleFrameTimestamps.size).toBe(
      FRAME_TIMESTAMP_CAPACITY,
    );
  });

  it('should drop oldest action timestamps when capacity is reached', () => {
    for (let i = 0; i < ACTION_TIMESTAMP_CAPACITY; i++) {
      profiler.actionTimestamps.push(i);
    }
    profiler.lastActionTimestamp = 0;
    profiler.reportAction();

    expect(profiler.actionTimestamps.size).toBe(ACTION_TIMESTAMP_CAPACITY);
    expect(profiler.actionTimestamps.peekFirst()).toBe(1);
  });

  it('should drop oldest frame timestamps when capacity is reached', () => {
    for (let i = 0; i < FRAME_TIMESTAMP_CAPACITY; i++) {
      profiler.possiblyIdleFrameTimestamps.push(i);
    }
    profiler.lastFrameStartTime = 0;
    profiler.reportFrameRendered();

    expect(profiler.possiblyIdleFrameTimestamps.size).toBe(
      FRAME_TIMESTAMP_CAPACITY,
    );
    expect(profiler.possiblyIdleFrameTimestamps.peekFirst()).toBe(1);
  });

  it('should not report frames as idle if an action happens shortly after', async () => {
    const startTime = Date.now();
    vi.setSystemTime(startTime);

    for (let i = 0; i < 5; i++) {
      profiler.reportFrameRendered();
      vi.advanceTimersByTime(20);
    }

    vi.setSystemTime(startTime + 400);
    profiler.reportAction();

    vi.advanceTimersByTime(600);
    profiler.checkForIdleFrames();

    expect(profiler.totalIdleFrames).toBe(0);
  });

  it('should report frames as idle if no action happens nearby', async () => {
    const startTime = Date.now();
    vi.setSystemTime(startTime);

    for (let i = 0; i < 5; i++) {
      profiler.reportFrameRendered();
      vi.advanceTimersByTime(20);
    }

    vi.advanceTimersByTime(1000);
    profiler.checkForIdleFrames();

    expect(profiler.totalIdleFrames).toBe(5);
  });

  it('should not report frames as idle if an action happens shortly before', async () => {
    const startTime = Date.now();
    vi.setSystemTime(startTime);

    profiler.reportAction();

    vi.advanceTimersByTime(400);

    for (let i = 0; i < 5; i++) {
      profiler.reportFrameRendered();
      vi.advanceTimersByTime(20);
    }

    vi.advanceTimersByTime(600);
    profiler.checkForIdleFrames();

    expect(profiler.totalIdleFrames).toBe(0);
  });

  it('should correctly identify mixed idle and non-idle frames', async () => {
    const startTime = Date.now();
    vi.setSystemTime(startTime);

    for (let i = 0; i < 3; i++) {
      profiler.reportFrameRendered();
      vi.advanceTimersByTime(20);
    }

    vi.advanceTimersByTime(1000);

    profiler.reportAction();
    vi.advanceTimersByTime(100);

    for (let i = 0; i < 3; i++) {
      profiler.reportFrameRendered();
      vi.advanceTimersByTime(20);
    }

    vi.advanceTimersByTime(600);
    profiler.checkForIdleFrames();

    expect(profiler.totalIdleFrames).toBe(3);
  });

  it('should report flicker frames', () => {
    const reportActionSpy = vi.spyOn(profiler, 'reportAction');
    const cleanup = profiler.registerFlickerHandler(true);

    appEvents.emit(AppEvent.Flicker);

    expect(profiler.totalFlickerFrames).toBe(1);
    expect(reportActionSpy).toHaveBeenCalled();

    cleanup();
  });

  it('should not report idle frames when actions are interleaved', async () => {
    const startTime = Date.now();
    vi.setSystemTime(startTime);

    profiler.reportFrameRendered();
    vi.advanceTimersByTime(20);

    profiler.reportFrameRendered();
    vi.advanceTimersByTime(200);

    profiler.reportAction();
    vi.advanceTimersByTime(200);

    profiler.reportFrameRendered();
    vi.advanceTimersByTime(20);

    profiler.reportFrameRendered();

    vi.advanceTimersByTime(600);
    profiler.checkForIdleFrames();

    expect(profiler.totalIdleFrames).toBe(0);
  });

  it('should not report frames as idle if debugNumAnimatedComponents > 0', async () => {
    const startTime = Date.now();
    vi.setSystemTime(startTime);
    debugState.debugNumAnimatedComponents = 1;

    for (let i = 0; i < 5; i++) {
      profiler.reportFrameRendered();
      vi.advanceTimersByTime(20);
    }

    vi.advanceTimersByTime(1000);
    profiler.checkForIdleFrames();

    expect(profiler.totalIdleFrames).toBe(0);
  });
});

describe('DebugProfiler Component', () => {
  beforeEach(() => {
    // Reset the mock implementation before each test
    vi.mocked(useUIState).mockReturnValue({
      showDebugProfiler: false,
      constrainHeight: false,
    } as unknown as UIState);

    // Mock process.stdin and stdout
    // We need to be careful not to break the test runner's own output
    // So we might want to skip mocking them if they are not strictly needed for the simple render test
    // or mock them safely.
    // For now, let's assume the component uses them in useEffect.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null when showDebugProfiler is false', () => {
    vi.mocked(useUIState).mockReturnValue({
      showDebugProfiler: false,
      constrainHeight: false,
    } as unknown as UIState);
    const { lastFrame } = render(<DebugProfiler />);
    expect(lastFrame()).toBe('');
  });

  it('should render stats when showDebugProfiler is true', () => {
    vi.mocked(useUIState).mockReturnValue({
      showDebugProfiler: true,
      constrainHeight: false,
    } as unknown as UIState);
    profiler.numFrames = 10;
    profiler.totalIdleFrames = 5;
    profiler.totalFlickerFrames = 2;

    const { lastFrame } = render(<DebugProfiler />);
    const output = lastFrame();

    expect(output).toContain('Renders: 10 (total)');
    expect(output).toContain('5 (idle)');
    expect(output).toContain('2 (flicker)');
  });
});
