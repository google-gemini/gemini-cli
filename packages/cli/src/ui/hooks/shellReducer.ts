/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AnsiOutput } from '@google/gemini-cli-core';

export interface BackgroundShell {
  pid: number;
  command: string;
  output: string | AnsiOutput;
  isBinary: boolean;
  binaryBytesReceived: number;
  status: 'running' | 'exited';
  exitCode?: number;
}

export interface ShellState {
  activeShellPtyId: number | null;
  lastShellOutputTime: number;
  backgroundShells: Map<number, BackgroundShell>;
  isBackgroundShellVisible: boolean;
}

export type ShellAction =
  | { type: 'SET_ACTIVE_PTY'; pid: number | null }
  | { type: 'SET_OUTPUT_TIME'; time: number }
  | { type: 'SET_VISIBILITY'; visible: boolean }
  | { type: 'TOGGLE_VISIBILITY' }
  | {
      type: 'REGISTER_SHELL';
      pid: number;
      command: string;
      initialOutput: string | AnsiOutput;
    }
  | { type: 'UPDATE_SHELL'; pid: number; update: Partial<BackgroundShell> }
  | { type: 'APPEND_SHELL_OUTPUT'; pid: number; chunk: string | AnsiOutput }
  | { type: 'SYNC_BACKGROUND_SHELLS' }
  | { type: 'DISMISS_SHELL'; pid: number };

export const initialState: ShellState = {
  activeShellPtyId: null,
  lastShellOutputTime: 0,
  backgroundShells: new Map(),
  isBackgroundShellVisible: false,
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
      return { ...state, isBackgroundShellVisible: action.visible };
    case 'TOGGLE_VISIBILITY':
      return {
        ...state,
        isBackgroundShellVisible: !state.isBackgroundShellVisible,
      };
    case 'REGISTER_SHELL': {
      if (state.backgroundShells.has(action.pid)) return state;
      const nextShells = new Map(state.backgroundShells);
      nextShells.set(action.pid, {
        pid: action.pid,
        command: action.command,
        output: action.initialOutput,
        isBinary: false,
        binaryBytesReceived: 0,
        status: 'running',
      });
      return { ...state, backgroundShells: nextShells };
    }
    case 'UPDATE_SHELL': {
      const shell = state.backgroundShells.get(action.pid);
      if (!shell) return state;
      const nextShells = new Map(state.backgroundShells);
      const updatedShell = { ...shell, ...action.update };
      // Maintain insertion order, move to end if status changed to exited
      if (action.update.status === 'exited') {
        nextShells.delete(action.pid);
      }
      nextShells.set(action.pid, updatedShell);
      return { ...state, backgroundShells: nextShells };
    }
    case 'APPEND_SHELL_OUTPUT': {
      const shell = state.backgroundShells.get(action.pid);
      if (!shell) return state;
      // Note: we mutate the shell object in the map for background updates
      // to avoid re-rendering if the drawer is not visible.
      // This is an intentional performance optimization for the CLI.
      let newOutput = shell.output;
      if (typeof action.chunk === 'string') {
        newOutput =
          typeof shell.output === 'string'
            ? shell.output + action.chunk
            : action.chunk;
      } else {
        newOutput = action.chunk;
      }
      shell.output = newOutput;

      const nextState = { ...state, lastShellOutputTime: Date.now() };

      if (state.isBackgroundShellVisible) {
        return {
          ...nextState,
          backgroundShells: new Map(state.backgroundShells),
        };
      }
      return nextState;
    }
    case 'SYNC_BACKGROUND_SHELLS': {
      return { ...state, backgroundShells: new Map(state.backgroundShells) };
    }
    case 'DISMISS_SHELL': {
      const nextShells = new Map(state.backgroundShells);
      nextShells.delete(action.pid);
      return {
        ...state,
        backgroundShells: nextShells,
        isBackgroundShellVisible:
          nextShells.size === 0 ? false : state.isBackgroundShellVisible,
      };
    }
    default:
      return state;
  }
}
