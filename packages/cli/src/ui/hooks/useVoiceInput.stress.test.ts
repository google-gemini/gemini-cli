/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useVoiceInput } from './useVoiceInput.js';
import { spawn, execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, stat, readFile, unlink } from 'node:fs/promises';

vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>(
      'node:child_process',
    );
  return {
    ...actual,
    spawn: vi.fn(),
    execFile: vi.fn((_file, _args, cb) => {
      if (typeof cb === 'function') {
        cb(null, { stdout: '/usr/bin/sox' });
      }
    }),
  };
});

vi.mock('node:fs/promises', async () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue('/tmp/gemini-voice-mock'),
  stat: vi.fn().mockResolvedValue({ size: 1000 }),
  readFile: vi.fn().mockResolvedValue('Mock transcript'),
  access: vi.fn().mockResolvedValue(undefined),
}));

interface MockProcess extends EventEmitter {
  kill: ReturnType<typeof vi.fn>;
  pid: number;
  stderr: EventEmitter;
}

describe('useVoiceInput Stress Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish mock implementations after restoreAllMocks
    vi.mocked(mkdtemp).mockResolvedValue('/tmp/gemini-voice-mock');
    vi.mocked(stat).mockResolvedValue({ size: 1000 } as Awaited<
      ReturnType<typeof stat>
    >);
    vi.mocked(readFile).mockResolvedValue('Mock transcript');
    vi.mocked(unlink).mockResolvedValue(undefined);
    vi.mocked(execFile).mockImplementation(((
      _file: string,
      _args: string[],
      cb: (error: Error | null, result?: { stdout: string }) => void,
    ) => {
      cb(null, { stdout: '/usr/bin/sox' });
    }) as unknown as typeof execFile);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not cause excessive re-renders when receiving rapid sox progress logs', async () => {
    const mockProcess = new EventEmitter() as MockProcess;
    mockProcess.kill = vi.fn();
    mockProcess.pid = 123;
    mockProcess.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(
      mockProcess as unknown as ReturnType<typeof spawn>,
    );

    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useVoiceInput();
    });

    // Reset count after initial render
    renderCount = 0;

    await act(async () => {
      await result.current.startRecording();
    });

    // startRecording itself causes state updates (isRecording: true)
    // We expect a small number of renders for state transitions.
    const baseRenders = renderCount;

    await act(async () => {
      // Simulate 100 progress logs from sox
      for (let i = 0; i < 100; i++) {
        mockProcess.stderr.emit(
          'data',
          Buffer.from(`In:0.00% 00:00:0${i} [00:00:00.00] Out:0 [ | ] Clip:0
`),
        );
      }
    });

    // If my filter is working, these 100 logs should cause ZERO additional renders
    // because they are filtered out before touching any state.
    expect(renderCount).toBe(baseRenders);
  });

  it('should not cause excessive re-renders when rapid toggleRecording calls are ignored', async () => {
    const mockProcess = new EventEmitter() as MockProcess;
    mockProcess.kill = vi.fn();
    mockProcess.pid = 123;
    mockProcess.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(
      mockProcess as unknown as ReturnType<typeof spawn>,
    );

    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useVoiceInput();
    });

    // Start recording so we are in a "busy" state
    await act(async () => {
      await result.current.startRecording();
    });

    const rendersAfterStart = renderCount;

    await act(async () => {
      // Simulate rapid user input (e.g. key repeat)
      // 50 rapid calls to toggleRecording
      // The FIRST call will trigger stopRecording() and one state update (isTranscribing: true)
      // The subsequent 49 calls should be ignored and cause ZERO renders.
      for (let i = 0; i < 50; i++) {
        await result.current.toggleRecording();
      }
    });

    // We expect exactly 1 additional render for the transition to transcribing.
    expect(renderCount).toBe(rendersAfterStart + 1);
  });
});
