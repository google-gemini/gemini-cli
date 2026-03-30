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

export type BackgroundShell = BackgroundTask;

export interface ShellState {
  activeShellPtyId: number | null;
  lastShellOutputTime: number;
  backgroundTasks: Map<number, BackgroundTask>;
  backgroundShells: Map<number, BackgroundShell>;
  isBackgroundTaskVisible: boolean;
  isBackgroundShellVisible: boolean;
}

export type ShellAction =
  | { type: 'SET_ACTIVE_PTY'; pid: number | null }
  | { type: 'SET_OUTPUT_TIME'; time: number }
  | { type: 'SET_VISIBILITY'; visible: boolean }
  | { type: 'TOGGLE_VISIBILITY' }
  | {
      type: 'REGISTER_TASK' | 'REGISTER_SHELL';
      pid: number;
      command: string;
      initialOutput: string | AnsiOutput;
      completionBehavior?: CompletionBehavior;
    }
  | {
      type: 'UPDATE_TASK' | 'UPDATE_SHELL';
      pid: number;
      update: Partial<BackgroundTask>;
    }
  | {
      type: 'APPEND_TASK_OUTPUT' | 'APPEND_SHELL_OUTPUT';
      pid: number;
      chunk: string | AnsiOutput;
    }
  | { type: 'SYNC_BACKGROUND_TASKS' | 'SYNC_BACKGROUND_SHELLS' }
  | { type: 'DISMISS_TASK' | 'DISMISS_SHELL'; pid: number };

function withAliases(state: {
  activeShellPtyId: number | null;
  lastShellOutputTime: number;
  backgroundTasks: Map<number, BackgroundTask>;
  isBackgroundTaskVisible: boolean;
}): ShellState {
  return {
    ...state,
    backgroundShells: state.backgroundTasks,
    isBackgroundShellVisible: state.isBackgroundTaskVisible,
  };
}

const initialBackgroundTasks = new Map<number, BackgroundTask>();

export const initialState: ShellState = {
  activeShellPtyId: null,
  lastShellOutputTime: 0,
  backgroundTasks: initialBackgroundTasks,
  backgroundShells: initialBackgroundTasks,
  isBackgroundTaskVisible: false,
  isBackgroundShellVisible: false,
};

export function shellReducer(
  state: ShellState,
  action: ShellAction,
): ShellState {
  switch (action.type) {
    case 'SET_ACTIVE_PTY':
      return withAliases({ ...state, activeShellPtyId: action.pid });
    case 'SET_OUTPUT_TIME':
      return withAliases({ ...state, lastShellOutputTime: action.time });
    case 'SET_VISIBILITY':
      return withAliases({
        ...state,
        isBackgroundTaskVisible: action.visible,
      });
    case 'TOGGLE_VISIBILITY':
      return withAliases({
        ...state,
        isBackgroundTaskVisible: !state.isBackgroundTaskVisible,
      });
    case 'REGISTER_TASK':
    case 'REGISTER_SHELL': {
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
      return withAliases({ ...state, backgroundTasks: nextTasks });
    }
    case 'UPDATE_TASK':
    case 'UPDATE_SHELL': {
      const task = state.backgroundTasks.get(action.pid);
      if (!task) return state;
      const nextTasks = new Map(state.backgroundTasks);
      const updatedTask = { ...task, ...action.update };
      if (action.update.status === 'exited') {
        nextTasks.delete(action.pid);
      }
      nextTasks.set(action.pid, updatedTask);
      return withAliases({ ...state, backgroundTasks: nextTasks });
    }
    case 'APPEND_TASK_OUTPUT':
    case 'APPEND_SHELL_OUTPUT': {
      const task = state.backgroundTasks.get(action.pid);
      if (!task) return state;

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

      const nextState = withAliases({
        ...state,
        lastShellOutputTime: Date.now(),
      });

      if (state.isBackgroundTaskVisible) {
        const nextTasks = new Map(state.backgroundTasks);
        return withAliases({
          ...nextState,
          backgroundTasks: nextTasks,
        });
      }
      return nextState;
    }
    case 'SYNC_BACKGROUND_TASKS':
    case 'SYNC_BACKGROUND_SHELLS': {
      return withAliases({
        ...state,
        backgroundTasks: new Map(state.backgroundTasks),
      });
    }
    case 'DISMISS_TASK':
    case 'DISMISS_SHELL': {
      const nextTasks = new Map(state.backgroundTasks);
      nextTasks.delete(action.pid);
      return withAliases({
        ...state,
        backgroundTasks: nextTasks,
        isBackgroundTaskVisible:
          nextTasks.size === 0 ? false : state.isBackgroundTaskVisible,
      });
    }
    default:
      return state;
  }
}
