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
    expect(state.isBackgroundTaskVisible).toBe(false); // Auto-hide if last shell
  });
});
