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
    expect(state.isBackgroundShellVisible).toBe(true);
  });

  it('should handle TOGGLE_VISIBILITY', () => {
    const action: ShellAction = { type: 'TOGGLE_VISIBILITY' };
    let state = shellReducer(initialState, action);
    expect(state.isBackgroundShellVisible).toBe(true);
    state = shellReducer(state, action);
    expect(state.isBackgroundShellVisible).toBe(false);
  });

  it('should handle REGISTER_SHELL', () => {
    const action: ShellAction = {
      type: 'REGISTER_SHELL',
      pid: 1001,
      command: 'ls',
      initialOutput: 'init',
    };
    const state = shellReducer(initialState, action);
    expect(state.backgroundShells.has(1001)).toBe(true);
    expect(state.backgroundShells.get(1001)).toEqual({
      pid: 1001,
      command: 'ls',
      output: 'init',
      isBinary: false,
      binaryBytesReceived: 0,
      status: 'running',
    });
  });

  it('should not REGISTER_SHELL if PID already exists', () => {
    const action: ShellAction = {
      type: 'REGISTER_SHELL',
      pid: 1001,
      command: 'ls',
      initialOutput: 'init',
    };
    const state = shellReducer(initialState, action);
    const state2 = shellReducer(state, { ...action, command: 'other' });
    expect(state2).toBe(state);
    expect(state2.backgroundShells.get(1001)?.command).toBe('ls');
  });

  it('should handle UPDATE_SHELL', () => {
    const registeredState = shellReducer(initialState, {
      type: 'REGISTER_SHELL',
      pid: 1001,
      command: 'ls',
      initialOutput: 'init',
    });

    const action: ShellAction = {
      type: 'UPDATE_SHELL',
      pid: 1001,
      update: { status: 'exited', exitCode: 0 },
    };
    const state = shellReducer(registeredState, action);
    const shell = state.backgroundShells.get(1001);
    expect(shell?.status).toBe('exited');
    expect(shell?.exitCode).toBe(0);
    // Map should be new
    expect(state.backgroundShells).not.toBe(registeredState.backgroundShells);
  });

  it('should handle APPEND_SHELL_OUTPUT when visible (triggers re-render)', () => {
    const visibleState: ShellState = {
      ...initialState,
      isBackgroundShellVisible: true,
      backgroundShells: new Map([
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
      type: 'APPEND_SHELL_OUTPUT',
      pid: 1001,
      chunk: ' + more',
    };
    const state = shellReducer(visibleState, action);
    expect(state.backgroundShells.get(1001)?.output).toBe('init + more');
    // Drawer is visible, so we expect a NEW map object to trigger React re-render
    expect(state.backgroundShells).not.toBe(visibleState.backgroundShells);
  });

  it('should handle APPEND_SHELL_OUTPUT when hidden (no re-render optimization)', () => {
    const hiddenState: ShellState = {
      ...initialState,
      isBackgroundShellVisible: false,
      backgroundShells: new Map([
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
      type: 'APPEND_SHELL_OUTPUT',
      pid: 1001,
      chunk: ' + more',
    };
    const state = shellReducer(hiddenState, action);
    expect(state.backgroundShells.get(1001)?.output).toBe('init + more');
    // Drawer is hidden, so we expect the SAME map object (mutation optimization)
    expect(state.backgroundShells).toBe(hiddenState.backgroundShells);
  });

  it('should handle SYNC_BACKGROUND_SHELLS', () => {
    const action: ShellAction = { type: 'SYNC_BACKGROUND_SHELLS' };
    const state = shellReducer(initialState, action);
    expect(state.backgroundShells).not.toBe(initialState.backgroundShells);
  });

  it('should handle DISMISS_SHELL', () => {
    const registeredState: ShellState = {
      ...initialState,
      isBackgroundShellVisible: true,
      backgroundShells: new Map([
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

    const action: ShellAction = { type: 'DISMISS_SHELL', pid: 1001 };
    const state = shellReducer(registeredState, action);
    expect(state.backgroundShells.has(1001)).toBe(false);
    expect(state.isBackgroundShellVisible).toBe(false); // Auto-hide if last shell
  });

  it('should not truncate shell output below the amortization threshold', () => {
    // Output at exactly MAX_SHELL_OUTPUT_SIZE should NOT be truncated yet —
    // truncation only fires after MAX_SHELL_OUTPUT_SIZE + SHELL_OUTPUT_TRUNCATION_BUFFER.
    const initialOutput = 'a'.repeat(MAX_SHELL_OUTPUT_SIZE);
    const state: ShellState = {
      ...initialState,
      isBackgroundShellVisible: false,
      backgroundShells: new Map([
        [
          1001,
          {
            pid: 1001,
            command: 'long-running-cmd',
            output: initialOutput,
            isBinary: false,
            binaryBytesReceived: 0,
            status: 'running',
          },
        ],
      ]),
    };

    const newChunk = 'b'.repeat(100);
    const result = shellReducer(state, {
      type: 'APPEND_SHELL_OUTPUT',
      pid: 1001,
      chunk: newChunk,
    });
    const output = result.backgroundShells.get(1001)?.output as string;

    // Has not yet hit the truncation trigger — full output retained
    expect(output.length).toBe(MAX_SHELL_OUTPUT_SIZE + 100);
    expect(output.endsWith(newChunk)).toBe(true);
  });

  it('should truncate shell output once it exceeds MAX_SHELL_OUTPUT_SIZE + SHELL_OUTPUT_TRUNCATION_BUFFER', () => {
    // Build output that is 1 byte past the amortization trigger
    const triggerSize =
      MAX_SHELL_OUTPUT_SIZE + SHELL_OUTPUT_TRUNCATION_BUFFER + 1;
    const initialOutput = 'a'.repeat(triggerSize);
    const state: ShellState = {
      ...initialState,
      isBackgroundShellVisible: false,
      backgroundShells: new Map([
        [
          1001,
          {
            pid: 1001,
            command: 'long-running-cmd',
            output: initialOutput,
            isBinary: false,
            binaryBytesReceived: 0,
            status: 'running',
          },
        ],
      ]),
    };

    const newChunk = 'b'.repeat(100);
    const result = shellReducer(state, {
      type: 'APPEND_SHELL_OUTPUT',
      pid: 1001,
      chunk: newChunk,
    });
    const output = result.backgroundShells.get(1001)?.output as string;

    // Truncated back to MAX_SHELL_OUTPUT_SIZE, newest data preserved
    expect(output.length).toBe(MAX_SHELL_OUTPUT_SIZE);
    expect(output.endsWith(newChunk)).toBe(true);
  });
});
