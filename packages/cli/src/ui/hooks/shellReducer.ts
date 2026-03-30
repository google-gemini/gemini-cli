/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AnsiOutput, CompletionBehavior } from '@google/gemini-cli-core';

export interface BackgroundTask {
  pid: number;
  command: string;
  output: string | AnsiOutput;
  isBinary: boolean;
  binaryBytesReceived: number;
  status: 'running' | 'exited';
  exitCode?: number;
  completionBehavior?: CompletionBehavior;
}

export interface ShellState {
  activeShellPtyId: number | null;
  lastShellOutputTime: number;
  backgroundTasks: Map<number, BackgroundTask>;
  isBackgroundTaskVisible: boolean;
}

export type ShellAction =
  | { type: 'SET_ACTIVE_PTY'; pid: number | null }
  | { type: 'SET_OUTPUT_TIME'; time: number }
  | { type: 'SET_VISIBILITY'; visible: boolean }
  | { type: 'TOGGLE_VISIBILITY' }
  | {
      type: 'REGISTER_TASK';
      pid: number;
      command: string;
      initialOutput: string | AnsiOutput;
      completionBehavior?: CompletionBehavior;
    }
  | { type: 'UPDATE_TASK'; pid: number; update: Partial<BackgroundTask> }
  | { type: 'APPEND_TASK_OUTPUT'; pid: number; chunk: string | AnsiOutput }
  | { type: 'SYNC_BACKGROUND_TASKS' }
  | { type: 'DISMISS_TASK'; pid: number };

export const initialState: ShellState = {
  activeShellPtyId: null,
  lastShellOutputTime: 0,
  backgroundTasks: new Map(),
  isBackgroundTaskVisible: false,
};

export function shellReducer(
  state: ShellState,
  action: ShellAction,
): ShellState {
  switch (action.type) {
    case 'SET_ACTIVE_PTY':
      return { ...state, activeShellPtyId: action.pid };
    case 'SET_OUTPUT_TIME':
      return { ...state, lastShellOutputTime: action.time };
    case 'SET_VISIBILITY':
      return { ...state, isBackgroundTaskVisible: action.visible };
    case 'TOGGLE_VISIBILITY':
      return {
        ...state,
        isBackgroundTaskVisible: !state.isBackgroundTaskVisible,
      };
    case 'REGISTER_TASK': {
      if (state.backgroundTasks.has(action.pid)) return state;
      const nextTasks = new Map(state.backgroundTasks);
      nextTasks.set(action.pid, {
        pid: action.pid,
        command: action.command,
        output: action.initialOutput,
        isBinary: false,
        binaryBytesReceived: 0,
        status: 'running',
        completionBehavior: action.completionBehavior,
      });
      return { ...state, backgroundTasks: nextTasks };
    }
    case 'UPDATE_TASK': {
      const task = state.backgroundTasks.get(action.pid);
      if (!task) return state;
      const nextTasks = new Map(state.backgroundTasks);
      const updatedTask = { ...task, ...action.update };
      // Maintain insertion order, move to end if status changed to exited
      if (action.update.status === 'exited') {
        nextTasks.delete(action.pid);
      }
      nextTasks.set(action.pid, updatedTask);
      return { ...state, backgroundTasks: nextTasks };
    }
    case 'APPEND_TASK_OUTPUT': {
      const task = state.backgroundTasks.get(action.pid);
      if (!task) return state;
      // Note: we mutate the task object in the map for background updates
      // to avoid re-rendering if the drawer is not visible.
      // This is an intentional performance optimization for the CLI.
      let newOutput = task.output;
      if (typeof action.chunk === 'string') {
        newOutput =
          typeof task.output === 'string'
            ? task.output + action.chunk
            : action.chunk;
      } else {
        newOutput = action.chunk;
      }
      task.output = newOutput;

      const nextState = { ...state, lastShellOutputTime: Date.now() };

      if (state.isBackgroundTaskVisible) {
        return {
          ...nextState,
          backgroundTasks: new Map(state.backgroundTasks),
        };
      }
      return nextState;
    }
    case 'SYNC_BACKGROUND_TASKS': {
      return { ...state, backgroundTasks: new Map(state.backgroundTasks) };
    }
    case 'DISMISS_TASK': {
      const nextTasks = new Map(state.backgroundTasks);
      nextTasks.delete(action.pid);
      return {
        ...state,
        backgroundTasks: nextTasks,
        isBackgroundTaskVisible:
          nextTasks.size === 0 ? false : state.isBackgroundTaskVisible,
      };
    }
    default:
      return state;
  }
}
