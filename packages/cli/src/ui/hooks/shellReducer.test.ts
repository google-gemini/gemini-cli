/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  shellReducer,
  initialState,
  type ShellState,
  type ShellAction,
} from './shellReducer.js';
import {
  MAX_SHELL_OUTPUT_SIZE,
  SHELL_OUTPUT_TRUNCATION_BUFFER,
} from '../constants.js';

describe('shellReducer', () => {
  it('should return the initial state', () => {
    // @ts-expect-error - testing default case
    expect(shellReducer(initialState, { type: 'UNKNOWN' })).toEqual(
      initialState,
    );
  });

  it('should handle SET_ACTIVE_PTY', () => {
    const action: ShellAction = { type: 'SET_ACTIVE_PTY', pid: 12345 };
    const state = shellReducer(initialState, action);
    expect(state.activeShellPtyId).toBe(12345);
  });

  it('should handle SET_OUTPUT_TIME', () => {
    const now = Date.now();
    const action: ShellAction = { type: 'SET_OUTPUT_TIME', time: now };
    const state = shellReducer(initialState, action);
    expect(state.lastShellOutputTime).toBe(now);
  });

  it('should handle SET_VISIBILITY', () => {
    const action: ShellAction = { type: 'SET_VISIBILITY', visible: true };
    const state = shellReducer(initialState, action);
    expect(state.isBackgroundTaskVisible).toBe(true);
  });

  it('should handle TOGGLE_VISIBILITY', () => {
    const action: ShellAction = { type: 'TOGGLE_VISIBILITY' };
    let state = shellReducer(initialState, action);
    expect(state.isBackgroundTaskVisible).toBe(true);
    state = shellReducer(state, action);
    expect(state.isBackgroundTaskVisible).toBe(false);
  });

  it('should handle REGISTER_TASK', () => {
    const action: ShellAction = {
      type: 'REGISTER_TASK',
      pid: 1001,
      command: 'ls',
      initialOutput: 'init',
    };
    const state = shellReducer(initialState, action);
    expect(state.backgroundTasks.has(1001)).toBe(true);
    expect(state.backgroundTasks.get(1001)).toEqual({
      pid: 1001,
      command: 'ls',
      output: 'init',
      isBinary: false,
      binaryBytesReceived: 0,
      status: 'running',
    });
  });

  it('should not REGISTER_TASK if PID already exists', () => {
    const action: ShellAction = {
      type: 'REGISTER_TASK',
      pid: 1001,
      command: 'ls',
      initialOutput: 'init',
    };
    const state = shellReducer(initialState, action);
    const state2 = shellReducer(state, { ...action, command: 'other' });
    expect(state2).toBe(state);
    expect(state2.backgroundTasks.get(1001)?.command).toBe('ls');
  });

  it('should handle UPDATE_TASK', () => {
    const registeredState = shellReducer(initialState, {
      type: 'REGISTER_TASK',
      pid: 1001,
      command: 'ls',
      initialOutput: 'init',
    });

    const action: ShellAction = {
      type: 'UPDATE_TASK',
      pid: 1001,
      update: { status: 'exited', exitCode: 0 },
    };
    const state = shellReducer(registeredState, action);
    const shell = state.backgroundTasks.get(1001);
    expect(shell?.status).toBe('exited');
    expect(shell?.exitCode).toBe(0);
    // Map should be new
    expect(state.backgroundTasks).not.toBe(registeredState.backgroundTasks);
  });

  it('should handle APPEND_TASK_OUTPUT when visible (triggers re-render)', () => {
    const visibleState: ShellState = {
      ...initialState,
      isBackgroundTaskVisible: true,
      backgroundTasks: new Map([
        [
          1001,
          {
            pid: 1001,
            command: 'ls',
            output: 'init',
            isBinary: false,
            binaryBytesReceived: 0,
            status: 'running',
          },
        ],
      ]),
    };

    const action: ShellAction = {
      type: 'APPEND_TASK_OUTPUT',
      pid: 1001,
      chunk: ' + more',
    };
    const state = shellReducer(visibleState, action);
    expect(state.backgroundTasks.get(1001)?.output).toBe('init + more');
    // Drawer is visible, so we expect a NEW map object to trigger React re-render
    expect(state.backgroundTasks).not.toBe(visibleState.backgroundTasks);
  });

  it('should handle APPEND_TASK_OUTPUT when hidden (no re-render optimization)', () => {
    const hiddenState: ShellState = {
      ...initialState,
      isBackgroundTaskVisible: false,
      backgroundTasks: new Map([
        [
          1001,
          {
            pid: 1001,
            command: 'ls',
            output: 'init',
            isBinary: false,
            binaryBytesReceived: 0,
            status: 'running',
          },
        ],
      ]),
    };

    const action: ShellAction = {
      type: 'APPEND_TASK_OUTPUT',
      pid: 1001,
      chunk: ' + more',
    };
    const state = shellReducer(hiddenState, action);
    expect(state.backgroundTasks.get(1001)?.output).toBe('init + more');
    // Drawer is hidden, so we expect the SAME map object (mutation optimization)
    expect(state.backgroundTasks).toBe(hiddenState.backgroundTasks);
  });

  it('should handle SYNC_BACKGROUND_TASKS', () => {
    const action: ShellAction = { type: 'SYNC_BACKGROUND_TASKS' };
    const state = shellReducer(initialState, action);
    expect(state.backgroundTasks).not.toBe(initialState.backgroundTasks);
  });

  it('should handle DISMISS_TASK', () => {
    const registeredState: ShellState = {
      ...initialState,
      isBackgroundTaskVisible: true,
      backgroundTasks: new Map([
        [
          1001,
          {
            pid: 1001,
            command: 'ls',
            output: 'init',
            isBinary: false,
            binaryBytesReceived: 0,
            status: 'running',
          },
        ],
      ]),
    };

    const action: ShellAction = { type: 'DISMISS_TASK', pid: 1001 };
    const state = shellReducer(registeredState, action);
    expect(state.backgroundTasks.has(1001)).toBe(false);
    expect(state.isBackgroundTaskVisible).toBe(false); // Auto-hide if last task
  });

  it('should NOT truncate output when below the size threshold', () => {
    const existingOutput = 'x'.repeat(MAX_SHELL_OUTPUT_SIZE - 1);
    const chunk = 'y';
    // combined length = MAX_SHELL_OUTPUT_SIZE, well below MAX + BUFFER
    const taskState: ShellState = {
      ...initialState,
      backgroundTasks: new Map([
        [
          1001,
          {
            pid: 1001,
            command: 'tail -f log',
            output: existingOutput,
            isBinary: false,
            binaryBytesReceived: 0,
            status: 'running',
          },
        ],
      ]),
    };

    const action: ShellAction = {
      type: 'APPEND_TASK_OUTPUT',
      pid: 1001,
      chunk,
    };
    const state = shellReducer(taskState, action);
    const output = state.backgroundTasks.get(1001)?.output;
    expect(typeof output).toBe('string');
    expect((output as string).length).toBe(MAX_SHELL_OUTPUT_SIZE);
    expect((output as string).endsWith(chunk)).toBe(true);
  });

  it('should truncate output to MAX_SHELL_OUTPUT_SIZE when threshold is exceeded', () => {
    // existing output is already at MAX_SHELL_OUTPUT_SIZE + SHELL_OUTPUT_TRUNCATION_BUFFER
    const existingOutput = 'a'.repeat(
      MAX_SHELL_OUTPUT_SIZE + SHELL_OUTPUT_TRUNCATION_BUFFER,
    );
    const chunk = 'b'.repeat(100);
    // combined length = MAX + BUFFER + 100, which exceeds the threshold
    const taskState: ShellState = {
      ...initialState,
      backgroundTasks: new Map([
        [
          1001,
          {
            pid: 1001,
            command: 'tail -f log',
            output: existingOutput,
            isBinary: false,
            binaryBytesReceived: 0,
            status: 'running',
          },
        ],
      ]),
    };

    const action: ShellAction = {
      type: 'APPEND_TASK_OUTPUT',
      pid: 1001,
      chunk,
    };
    const state = shellReducer(taskState, action);
    const output = state.backgroundTasks.get(1001)?.output;
    expect(typeof output).toBe('string');
    // After truncation the result should be exactly MAX_SHELL_OUTPUT_SIZE chars
    expect((output as string).length).toBe(MAX_SHELL_OUTPUT_SIZE);
    // The newest chunk should be preserved at the end
    expect((output as string).endsWith(chunk)).toBe(true);
  });

  it('should preserve output when appending empty string', () => {
    const originalOutput = 'important data' + 'x'.repeat(5000);
    const taskState: ShellState = {
      ...initialState,
      backgroundTasks: new Map([
        [
          1001,
          {
            pid: 1001,
            command: 'tail -f log',
            output: originalOutput,
            isBinary: false,
            binaryBytesReceived: 0,
            status: 'running',
          },
        ],
      ]),
    };

    const action: ShellAction = {
      type: 'APPEND_TASK_OUTPUT',
      pid: 1001,
      chunk: '', // Empty string should not modify output
    };

    const state = shellReducer(taskState, action);
    const output = state.backgroundTasks.get(1001)?.output;

    // Empty string should leave output unchanged
    expect(output).toBe(originalOutput);
    expect(output).not.toBe('');
  });

  it('should handle chunks larger than MAX_SHELL_OUTPUT_SIZE', () => {
    // Setup: existing output that when combined with large chunk exceeds threshold
    const existingOutput = 'a'.repeat(1_500_000); // 1.5 MB
    const largeChunk = 'b'.repeat(MAX_SHELL_OUTPUT_SIZE + 10_000); // 10.01 MB
    // Combined exceeds MAX (10MB) + BUFFER (1MB) = 11MB threshold
    const taskState: ShellState = {
      ...initialState,
      backgroundTasks: new Map([
        [
          1001,
          {
            pid: 1001,
            command: 'test',
            output: existingOutput,
            isBinary: false,
            binaryBytesReceived: 0,
            status: 'running',
          },
        ],
      ]),
    };

    const action: ShellAction = {
      type: 'APPEND_TASK_OUTPUT',
      pid: 1001,
      chunk: largeChunk,
    };

    const state = shellReducer(taskState, action);
    const output = state.backgroundTasks.get(1001)?.output as string;

    expect(typeof output).toBe('string');
    // After truncation, output should be exactly MAX_SHELL_OUTPUT_SIZE
    expect(output.length).toBe(MAX_SHELL_OUTPUT_SIZE);
    // Because largeChunk > MAX_SHELL_OUTPUT_SIZE, we only preserve its tail
    expect(output).toBe('b'.repeat(MAX_SHELL_OUTPUT_SIZE));
  });
});
