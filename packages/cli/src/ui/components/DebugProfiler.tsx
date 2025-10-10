/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { useEffect, useState } from 'react';
import { FixedDeque } from 'mnemonist';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { debugNumSpinners } from './CliSpinner.js';
import { appEvents, AppEvent } from '../../utils/events.js';

// Frames that render at least this far before or after an action are considered
// idle frames.
const MIN_TIME_FROM_ACTION_TO_BE_IDLE = 500;

export const ACTION_TIMESTAMP_CAPACITY = 2048;
export const FRAME_TIMESTAMP_CAPACITY = 2048;

// Exported for testing purposes.
export const profiler = {
  numFrames: 0,
  totalIdleFrames: 0,
  totalFlickerFrames: 0,
  hasLoggedFirstFlicker: false,
  lastFrameStartTime: 0,
  openedDebugConsole: false,
  lastActionTimestamp: 0,

  possiblyIdleFrameTimestamps: new FixedDeque<number>(
    Array,
    FRAME_TIMESTAMP_CAPACITY,
  ),
  actionTimestamps: new FixedDeque<number>(Array, ACTION_TIMESTAMP_CAPACITY),

  reportAction() {
    const now = Date.now();
    if (now - this.lastActionTimestamp > 16) {
      if (this.actionTimestamps.size >= ACTION_TIMESTAMP_CAPACITY) {
        this.actionTimestamps.shift();
      }
      this.actionTimestamps.push(now);
      this.lastActionTimestamp = now;
    }
  },

  reportFrameRendered() {
    const now = Date.now();
    // Simple frame detection logic (a write after at least 16ms is a new frame)
    if (now - this.lastFrameStartTime > 16) {
      this.lastFrameStartTime = now;
      this.numFrames++;
      if (debugNumSpinners === 0) {
        if (this.possiblyIdleFrameTimestamps.size >= FRAME_TIMESTAMP_CAPACITY) {
          this.possiblyIdleFrameTimestamps.shift();
        }
        this.possiblyIdleFrameTimestamps.push(now);
      } else {
        // If a spinner is present, consider this an action that both prevents
        // this frame from being idle and also should prevent a follow on frame
        // from being considered idle.
        if (this.actionTimestamps.size >= ACTION_TIMESTAMP_CAPACITY) {
          this.actionTimestamps.shift();
        }
        this.actionTimestamps.push(now);
      }
    }
  },

  checkForIdleFrames() {
    const now = Date.now();
    const judgementCutoff = now - MIN_TIME_FROM_ACTION_TO_BE_IDLE;
    const oneSecondIntervalFromJudgementCutoff = judgementCutoff - 1000;

    let idleInPastSecond = 0;

    while (
      this.possiblyIdleFrameTimestamps.size > 0 &&
      this.possiblyIdleFrameTimestamps.peekFirst()! <= judgementCutoff
    ) {
      const frameTime = this.possiblyIdleFrameTimestamps.shift()!;
      const start = frameTime - MIN_TIME_FROM_ACTION_TO_BE_IDLE;
      const end = frameTime + MIN_TIME_FROM_ACTION_TO_BE_IDLE;

      while (
        this.actionTimestamps.size > 0 &&
        this.actionTimestamps.peekFirst()! < start
      ) {
        this.actionTimestamps.shift();
      }

      const hasAction =
        this.actionTimestamps.size > 0 &&
        this.actionTimestamps.peekFirst()! <= end;

      if (!hasAction) {
        if (frameTime >= oneSecondIntervalFromJudgementCutoff) {
          idleInPastSecond++;
        }
        this.totalIdleFrames++;
      }
    }

    if (idleInPastSecond >= 5) {
      if (this.openedDebugConsole === false) {
        this.openedDebugConsole = true;
        appEvents.emit(AppEvent.OpenDebugConsole);
      }
      appEvents.emit(
        AppEvent.LogError,
        `${idleInPastSecond} frames rendered while the app was ` +
          `idle in the past second. This likely indicates severe infinite loop ` +
          `React state management bugs.`,
      );
    }
  },

  registerFlickerHandler(constrainHeight: boolean) {
    const flickerHandler = () => {
      // If we are not constraining the height, we are intentionally
      // overflowing the screen.
      if (!constrainHeight) {
        return;
      }

      this.totalFlickerFrames++;
      this.reportAction();

      if (!this.hasLoggedFirstFlicker) {
        this.hasLoggedFirstFlicker = true;
        appEvents.emit(
          AppEvent.LogError,
          'A flicker frame was detected. This will cause UI instability. Type `/profile` for more info.',
        );
      }
    };
    appEvents.on(AppEvent.Flicker, flickerHandler);
    return () => {
      appEvents.off(AppEvent.Flicker, flickerHandler);
    };
  },
};

export const DebugProfiler = () => {
  const { showDebugProfiler, constrainHeight } = useUIState();
  const [forceRefresh, setForceRefresh] = useState(0);

  // Effect for listening to stdin for keypresses and stdout for resize events.
  useEffect(() => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    const handler = () => {
      profiler.reportAction();
    };

    stdin.on('data', handler);
    stdout.on('resize', handler);

    return () => {
      stdin.off('data', handler);
      stdout.off('resize', handler);
    };
  }, []);

  // Effect for patching stdout to count frames and detect idle ones
  useEffect(() => {
    const originalWrite = process.stdout.write;
    const boundOriginalWrite = originalWrite.bind(process.stdout);

    process.stdout.write = (
      chunk: Uint8Array | string,
      encodingOrCb?:
        | BufferEncoding
        | ((err?: NodeJS.ErrnoException | null) => void),
      cb?: (err?: NodeJS.ErrnoException | null) => void,
    ) => {
      profiler.reportFrameRendered();

      if (typeof encodingOrCb === 'function') {
        return boundOriginalWrite(chunk, encodingOrCb);
      }
      return boundOriginalWrite(chunk, encodingOrCb, cb);
    };

    return () => {
      process.stdout.write = originalWrite;
    };
  }, []);

  useEffect(() => {
    const updateInterval = setInterval(() => {
      profiler.checkForIdleFrames();
    }, 1000);
    return () => clearInterval(updateInterval);
  }, []);

  useEffect(
    () => profiler.registerFlickerHandler(constrainHeight),
    [constrainHeight],
  );

  // Effect for updating stats
  useEffect(() => {
    if (!showDebugProfiler) {
      return;
    }
    // Only update the UX infrequently as updating the UX itself will cause
    // frames to run so can disturb what we are measuing.
    const forceRefreshInterval = setInterval(() => {
      setForceRefresh((f) => f + 1);
      profiler.reportAction();
    }, 4000);
    return () => clearInterval(forceRefreshInterval);
  }, [showDebugProfiler]);

  if (!showDebugProfiler) {
    return null;
  }

  return (
    <Text color={theme.status.warning} key={forceRefresh}>
      Renders: {profiler.numFrames} (total),{' '}
      <Text color={theme.status.error}>{profiler.totalIdleFrames} (idle)</Text>,{' '}
      <Text color={theme.status.error}>
        {profiler.totalFlickerFrames} (flicker)
      </Text>
    </Text>
  );
};
