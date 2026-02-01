/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useVoiceInput } from './useVoiceInput.js';
import * as child_process from 'node:child_process';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>(
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

describe('useVoiceInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useVoiceInput());
    expect(result.current.state).toEqual({
      isRecording: false,
      isTranscribing: false,
      transcript: null,
      error: null,
    });
  });

  it('should start recording using sox if available', async () => {
    const mockProcess = new EventEmitter() as unknown as ReturnType<
      typeof spawn
    >;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockProcess as any).kill = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockProcess as any).pid = 123;
    vi.mocked(spawn).mockReturnValue(mockProcess);

    const { result } = renderHook(() => useVoiceInput());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.state.isRecording).toBe(true);
    expect(spawn).toHaveBeenCalledWith('sox', expect.any(Array));
  });

  it('should stop recording and transcribe', async () => {
    const mockProcess = new EventEmitter() as unknown as ReturnType<
      typeof spawn
    >;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockProcess as any).kill = vi.fn(() => {
      // Simulate process exit
      setTimeout(() => mockProcess.emit('exit', 0), 10);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockProcess as any).pid = 123;
    vi.mocked(spawn).mockReturnValue(mockProcess);

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
    expect(result.current.state.transcript).toBe('Mock transcript');
  });

  it('should fall back to arecord if sox is not available', async () => {
    vi.mocked(spawn).mockReturnValue(
      new EventEmitter() as unknown as ReturnType<typeof spawn>,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(child_process.exec).mockImplementation(((cmd: string, cb: any) => {
      if (cmd === 'which sox') {
        cb(new Error('not found'));
      } else {
        cb(null, { stdout: '/usr/bin/arecord' });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    const { result } = renderHook(() => useVoiceInput());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(spawn).toHaveBeenCalledWith('arecord', expect.any(Array));
  });

  it('should handle errors when neither sox nor arecord is available', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(child_process.exec).mockImplementation(((cmd: string, cb: any) => {
      cb(new Error('not found'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    const { result } = renderHook(() => useVoiceInput());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.state.error).toContain('Neither sox nor arecord found');
    expect(result.current.state.isRecording).toBe(false);
  });
});
