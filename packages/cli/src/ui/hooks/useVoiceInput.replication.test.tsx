/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useContext, useEffect, useState } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { useVoiceInput, onVoiceTranscript } from './useVoiceInput.js';
import { VoiceContext } from '../contexts/VoiceContext.js';
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
  readFile: vi.fn().mockResolvedValue('this is a test'),
  access: vi.fn().mockResolvedValue(undefined),
}));

describe('Voice Input Full Cycle Replication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish mock implementations after restoreAllMocks
    vi.mocked(mkdtemp).mockResolvedValue('/tmp/gemini-voice-mock');
    vi.mocked(stat).mockResolvedValue({ size: 1000 } as Awaited<
      ReturnType<typeof stat>
    >);
    vi.mocked(readFile).mockResolvedValue('this is a test');
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

  it('should deliver transcript via event without causing re-renders', async () => {
    const mockProcess = new EventEmitter() as ReturnType<typeof spawn>;
    (
      mockProcess as unknown as {
        kill: ReturnType<typeof vi.fn>;
        pid: number;
        stderr: EventEmitter;
      }
    ).kill = vi.fn(() => {
      setTimeout(() => mockProcess.emit('exit', 0), 10);
    });
    (mockProcess as unknown as { pid: number }).pid = 123;
    (mockProcess as unknown as { stderr: EventEmitter }).stderr =
      new EventEmitter();
    vi.mocked(spawn).mockReturnValue(mockProcess);

    let _providerRenders = 0;
    let consumerRenders = 0;
    let effectRuns = 0;
    let transcriptReceived: string | null = null;

    // Provider: useVoiceInput hook
    const { result: providerResult, rerender: rerenderProvider } = renderHook(
      () => {
        _providerRenders++;
        return useVoiceInput();
      },
    );

    // Consumer: Simulates InputPrompt's new event-based usage
    const { rerender: rerenderConsumer } = renderHook(
      () => {
        consumerRenders++;
        const voice = useContext(VoiceContext);
        const voiceState = voice?.state;
        const [insertedText, setInsertedText] = useState<string | null>(null);

        // Event-based transcript handling (the fix)
        useEffect(() => {
          effectRuns++;

          const handleTranscript = (transcript: string) => {
            setInsertedText(transcript);
            transcriptReceived = transcript;
          };

          const unsubscribe = onVoiceTranscript(handleTranscript);
          return unsubscribe;
        }, []); // Empty deps - only runs once

        return { insertedText, voiceState, effectRuns };
      },
      {
        wrapper: ({ children }) => (
          <VoiceContext.Provider value={providerResult.current}>
            {children}
          </VoiceContext.Provider>
        ),
      },
    );

    // Reset counters after initial render (after setup effect runs)
    consumerRenders = 0;
    effectRuns = 0;

    // Step 1: Start recording
    await act(async () => {
      await providerResult.current.toggleRecording();
      rerenderProvider();
      rerenderConsumer();
    });

    // Step 2: Stop recording (triggers transcription)
    const rendersBefore = consumerRenders;
    const effectRunsBefore = effectRuns;

    await act(async () => {
      await providerResult.current.toggleRecording();
      // Force re-renders to propagate context changes
      rerenderProvider();
      rerenderConsumer();
    });

    // Wait for transcript to be delivered via event
    await waitFor(() => {
      expect(transcriptReceived).toBe('this is a test');
    });

    const rendersAfter = consumerRenders;
    const effectRunsAfter = effectRuns;
    const _rendersDuringTranscription = rendersAfter - rendersBefore;
    const effectRunsDuringTranscription = effectRunsAfter - effectRunsBefore;

    // With event-based approach, we should have very few effect runs
    // (effect only runs once for setup, not for each state change)
    expect(effectRunsDuringTranscription).toBeLessThanOrEqual(2);

    // Also verify minimal renders (should be < 5 for event-based)
    expect(_rendersDuringTranscription).toBeLessThan(5);
  });
});
