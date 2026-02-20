/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useVoiceInput } from './useVoiceInput.js';
import { debugLogger } from '@google/gemini-cli-core';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

// Mock child_process to simulate successful recording tools
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
        cb(null, { stdout: '/usr/bin/sox' }); // Simulate sox installed
      }
    }),
  };
});

// Mock fs to simulate file operations
vi.mock('node:fs/promises', async () => ({
  unlink: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue('/tmp/gemini-voice-mock'),
  stat: vi.fn().mockResolvedValue({ size: 1000 }),
  readFile: vi.fn().mockResolvedValue('Mock transcript'),
  access: vi.fn().mockResolvedValue(undefined),
}));

import { mkdtemp } from 'node:fs/promises';

interface MockProcess extends EventEmitter {
  kill: ReturnType<typeof vi.fn>;
  pid: number;
  stderr: EventEmitter;
}

describe('useVoiceInput Log Volume', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure mkdtemp returns a value for every test run
    vi.mocked(mkdtemp).mockResolvedValue('/tmp/gemini-voice-mock');

    // Spy on the logger methods that trigger UI re-renders
    logSpy = vi.spyOn(debugLogger, 'log');
    warnSpy = vi.spyOn(debugLogger, 'warn');
    errorSpy = vi.spyOn(debugLogger, 'error');

    // We intentionally DO NOT spy on 'debug' because those logs are safe/hidden.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should remain SILENT (no visible logs) during normal recording start/stop', async () => {
    // Setup a mock process
    const mockProcess = new EventEmitter() as MockProcess;
    mockProcess.kill = vi.fn(() => {
      setTimeout(() => mockProcess.emit('exit', 0), 5);
    });
    mockProcess.pid = 123;
    mockProcess.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(
      mockProcess as unknown as ReturnType<typeof spawn>,
    );

    const { result } = renderHook(() => useVoiceInput());

    // --- Action 1: Start Recording ---
    await act(async () => {
      await result.current.startRecording();
    });

    // Assertion: Starting recording should produce ZERO visible logs.
    // Previous failure mode: "sox found", "tempDir created", "process spawned" were all logged here.
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    // --- Action 2: Stop Recording ---
    await act(async () => {
      await result.current.stopRecording();
    });

    // Assertion: Stopping should also be silent.
    // Previous failure mode: "stopping recording", "file size", "transcript" logs.
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should remain SILENT even when sox spits out stderr progress', async () => {
    const mockProcess = new EventEmitter() as MockProcess;
    mockProcess.kill = vi.fn();
    mockProcess.pid = 123;
    mockProcess.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(
      mockProcess as unknown as ReturnType<typeof spawn>,
    );

    const { result } = renderHook(() => useVoiceInput());

    await act(async () => {
      await result.current.startRecording();
    });

    // Simulate noisy sox output
    await act(async () => {
      mockProcess.stderr.emit(
        'data',
        'In:0.00% 00:00:01 [00:00:00.00] Out:0 [ | ] Clip:0',
      );
      mockProcess.stderr.emit(
        'data',
        'In:0.00% 00:00:02 [00:00:00.00] Out:0 [ | ] Clip:0',
      );
    });

    // Assertion: stderr progress should be filtered and NOT logged
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
