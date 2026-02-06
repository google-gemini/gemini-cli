/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useVoiceInput, onVoiceTranscript } from './useVoiceInput.js';
import * as child_process from 'node:child_process';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>(
      'node:child_process',
    );
  return {
    ...actual,
    spawn: vi.fn(),
    exec: vi.fn((_cmd, cb) => {
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
}

type ExecCallback = (
  error: Error | null,
  stdout?: { stdout: string } | string,
  stderr?: string,
) => void;

describe('useVoiceInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.state).toEqual({
      isRecording: false,
      isTranscribing: false,
      error: null,
    });
  });

  it('should start recording using sox if available', async () => {
    const mockProcess = new EventEmitter() as MockProcess;
    mockProcess.kill = vi.fn();
    mockProcess.pid = 123;
    vi.mocked(spawn).mockReturnValue(
      mockProcess as unknown as ReturnType<typeof spawn>,
    );

    const { result } = renderHook(() => useVoiceInput());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.state.isRecording).toBe(true);
    expect(spawn).toHaveBeenCalledWith('sox', expect.any(Array));
  });

  it('should stop recording and emit transcript via event', async () => {
    const mockProcess = new EventEmitter() as MockProcess;
    mockProcess.kill = vi.fn(() => {
      // Simulate process exit
      setTimeout(() => mockProcess.emit('exit', 0), 10);
    });
    mockProcess.pid = 123;
    vi.mocked(spawn).mockReturnValue(
      mockProcess as unknown as ReturnType<typeof spawn>,
    );

    // Set up event listener to capture transcript
    const transcripts: string[] = [];
    const unsubscribe = onVoiceTranscript((transcript) => {
      transcripts.push(transcript);
    });

    const { result } = renderHook(() => useVoiceInput());

    // Start
    await act(async () => {
      await result.current.startRecording();
    });

    // Stop
    await act(async () => {
      await result.current.stopRecording();
    });

    expect(result.current.state.isRecording).toBe(false);
    // Transcript is now delivered via event, not state
    expect(transcripts).toContain('Mock transcript');

    unsubscribe();
  });

  it('should fall back to arecord if sox is not available', async () => {
    vi.mocked(spawn).mockReturnValue(
      new EventEmitter() as unknown as ReturnType<typeof spawn>,
    );
    vi.mocked(child_process.exec).mockImplementation(((
      cmd: string,
      cb: ExecCallback,
    ) => {
      if (cmd === 'which sox') {
        cb(new Error('not found'));
      } else {
        cb(null, { stdout: '/usr/bin/arecord' });
      }
    }) as unknown as typeof child_process.exec);

    const { result } = renderHook(() => useVoiceInput());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(spawn).toHaveBeenCalledWith('arecord', expect.any(Array));
  });

  it('should handle errors when neither sox nor arecord is available', async () => {
    vi.mocked(child_process.exec).mockImplementation(((
      cmd: string,
      cb: ExecCallback,
    ) => {
      cb(new Error('not found'));
    }) as unknown as typeof child_process.exec);

    const { result } = renderHook(() => useVoiceInput());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.state.error).toContain(
      'Neither sox nor arecord found',
    );
    expect(result.current.state.isRecording).toBe(false);
  });
});
