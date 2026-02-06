/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, tmpdir } from '@google/gemini-cli-core';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { unlink, mkdtemp, stat, access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

const execAsync = promisify(exec);

// Event-based transcript delivery to avoid context re-renders
// See VOICE_INFINITE_LOOP_ANALYSIS.md for details
const transcriptEmitter = new EventEmitter();

export interface VoiceInputState {
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  // NOTE: transcript is intentionally NOT in state - it's delivered via events
  // to avoid infinite render loops from context propagation
}

export interface VoiceInputReturn {
  state: VoiceInputState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  toggleRecording: () => Promise<void>;
}

/**
 * Subscribe to voice transcript events.
 * Use this instead of reading transcript from context to avoid re-renders.
 */
export function onVoiceTranscript(
  callback: (transcript: string) => void,
): () => void {
  transcriptEmitter.on('transcript', callback);
  return () => {
    transcriptEmitter.off('transcript', callback);
  };
}

// Configuration
const RECORDING_FORMAT = 'wav';
const SAMPLE_RATE = 16000;
const CHANNELS = 1;

/**
 * Hook for voice input using system audio recording and Whisper
 */
export function useVoiceInput(config?: {
  whisperPath?: string;
}): VoiceInputReturn {
  const [state, setState] = useState<VoiceInputState>({
    isRecording: false,
    isTranscribing: false,
    error: null,
  });

  const recordingProcessRef = useRef<ReturnType<typeof spawn> | null>(null);
  const tempDirRef = useRef<string | null>(null);
  const audioFileRef = useRef<string | null>(null);
  const sanitizedPathLoggedRef = useRef(false);
  // Guard against overlapping toggleRecording calls (race condition fix)
  const isTogglingRef = useRef(false);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (recordingProcessRef.current) {
        recordingProcessRef.current.kill('SIGINT');
      }
      if (audioFileRef.current) {
        void unlink(audioFileRef.current).catch(() => {});
      }
      if (tempDirRef.current) {
        // Clean up temp dir
      }
    },
    [],
  );

  const startRecording = useCallback(async () => {
    // Prevent starting if already recording
    if (recordingProcessRef.current) {
      debugLogger.log(
        'useVoiceInput: startRecording ignored - already recording',
      );
      return;
    }
    try {
      setState({ isRecording: true, isTranscribing: false, error: null });

      // Create temp directory
      const tempDir = await mkdtemp(join(tmpdir(), 'gemini-voice-'));
      debugLogger.log('useVoiceInput: tempDir created', tempDir);
      tempDirRef.current = tempDir;
      const audioFile = join(tempDir, `recording.${RECORDING_FORMAT}`);
      audioFileRef.current = audioFile;

      // Start recording with sox or arecord
      let recordProcess: ReturnType<typeof spawn>;

      // Try sox first, fall back to arecord
      try {
        await execAsync('which sox');
        debugLogger.log('useVoiceInput: sox found');
        recordProcess = spawn('sox', [
          '-d', // default input device
          '-b',
          '16',
          '-r',
          SAMPLE_RATE.toString(),
          '-c',
          CHANNELS.toString(),
          '-e',
          'signed-integer',
          '-t',
          RECORDING_FORMAT,
          audioFile,
        ]);

        recordProcess.stderr?.on('data', (data) => {
          debugLogger.log('useVoiceInput: sox stderr:', data.toString());
        });

        recordProcess.on('error', (err) => {
          debugLogger.log('useVoiceInput: sox error:', err.message);
        });

        recordProcess.on('exit', (code) => {
          debugLogger.log('useVoiceInput: sox exited with code:', code);
        });
      } catch {
        // Fall back to arecord (Linux)
        try {
          await execAsync('which arecord');
          debugLogger.log('useVoiceInput: arecord found');
          recordProcess = spawn('arecord', [
            '-f',
            'S16_LE',
            '-r',
            SAMPLE_RATE.toString(),
            '-c',
            CHANNELS.toString(),
            '-D',
            'default',
            audioFile,
          ]);
        } catch {
          debugLogger.error('useVoiceInput: Neither sox nor arecord found');
          throw new Error(
            'Neither sox nor arecord found. Please install one of them.',
          );
        }
      }

      debugLogger.log('useVoiceInput: recording process spawned', {
        pid: recordProcess.pid,
      });
      recordingProcessRef.current = recordProcess;

      recordProcess.on('error', (err) => {
        debugLogger.error('useVoiceInput: recording process error', err);
        setState({
          isRecording: false,
          isTranscribing: false,
          error: `Recording error: ${err.message}`,
        });
      });

      recordProcess.on('exit', (code, signal) => {
        debugLogger.log('useVoiceInput: recording process exited', {
          code,
          signal,
        });
      });
    } catch (err) {
      debugLogger.error('useVoiceInput: startRecording error', err);
      setState({
        isRecording: false,
        isTranscribing: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unknown error starting recording',
      });
    }
  }, []);

  const stopRecording = useCallback(async () => {
    // Prevent stopping if not recording
    if (!recordingProcessRef.current) {
      debugLogger.log('useVoiceInput: stopRecording ignored - not recording');
      return;
    }
    try {
      // Stop recording
      const processToKill = recordingProcessRef.current;
      if (processToKill) {
        debugLogger.log('useVoiceInput: stopping recording');
        processToKill.kill('SIGINT');

        // Wait for process to exit
        await new Promise<void>((resolve) => {
          processToKill.on('exit', () => resolve());
          // Timeout after 2 seconds
          setTimeout(() => resolve(), 2000);
        });

        recordingProcessRef.current = null;
      }

      setState({ isRecording: false, isTranscribing: true, error: null });

      const audioFile = audioFileRef.current;
      if (!audioFile) {
        throw new Error('No audio file found');
      }

      // Wait for file to be written (poll for up to 1s)
      let attempts = 0;
      while (attempts < 20) {
        try {
          const stats = await stat(audioFile);
          if (stats.size > 0) break;
        } catch {
          // ignore
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        attempts++;
      }

      // Check if file exists and has content
      let stats;
      try {
        stats = await stat(audioFile);
      } catch (e) {
        throw new Error(
          `Recording file not created. Is your microphone working? (${e})`,
        );
      }

      if (stats.size === 0) {
        throw new Error('No audio recorded (file is empty)');
      }

      debugLogger.log('useVoiceInput: audio file size', stats.size);

      // Transcribe using whisper-cli or faster-whisper
      let transcript = '';

      const runWhisper = async (binary: string, args: string) => {
        // If it looks like an absolute path, verify existence directly
        // This avoids 'which' issues with PATH
        if (binary.startsWith('/') || binary.startsWith('.')) {
          // Check for common configuration error: path with incorrect quotes
          if (binary.includes("'") || binary.includes('"')) {
            const sanitized = binary.replace(/['"]/g, '');
            if (sanitized !== binary) {
              try {
                await access(sanitized);
                if (!sanitizedPathLoggedRef.current) {
                  debugLogger.log(
                    'useVoiceInput: found sanitized path, using it instead',
                    sanitized,
                  );
                  sanitizedPathLoggedRef.current = true;
                }
                binary = sanitized;
              } catch {
                // Sanitized path also doesn't exist, proceed with original to let it fail or be logged
              }
            }
          }

          try {
            await access(binary);
          } catch {
            // If access fails, we'll fall through to try executing it (or it might fail there)
            // but checking 'which' on an absolute path is redundant/incorrect.
            debugLogger.log(
              'useVoiceInput: explicit path access check failed, but will try execution',
              binary,
            );
          }
        } else {
          // For command names, try to find them first
          try {
            await execAsync(`which ${binary}`);
          } catch {
            // If which fails, we might still try running it if we suspect it's in the PATH but not found by `sh -c which`
            // (e.g. some obscure shell setup). But usually `which` failure is authoritative.
            // However, for user convenience, let's allow proceeding if it's the configured path.
            if (binary === config?.whisperPath) {
              debugLogger.log(
                'useVoiceInput: `which` failed for configured path, but proceeding anyway',
              );
            } else {
              throw new Error(`Command not found: ${binary}`);
            }
          }
        }

        await execAsync(`${binary} ${args}`);
      };

      try {
        if (config?.whisperPath) {
          debugLogger.log(
            'useVoiceInput: using configured whisper path',
            config.whisperPath,
          );
          // If the user pointed to a python script, we might need to invoke it differently,
          // but let's assume it's an executable or wrapper script for now.
          await runWhisper(
            config.whisperPath,
            `"${audioFile}" --model tiny --output_format txt --output_dir "${tempDirRef.current}" `,
          );
          // Read the transcript file
          const transcriptFile = audioFile.replace('.wav', '.txt');
          transcript = await readFile(transcriptFile, 'utf-8');
        } else {
          // Try faster-whisper first
          try {
            await execAsync('which whisper-faster || which faster-whisper');
            await execAsync(
              `whisper-faster "${audioFile}" --model tiny --output_format txt --output_dir "${tempDirRef.current}"`,
            );
            // Read the transcript file
            const transcriptFile = audioFile.replace('.wav', '.txt');
            transcript = await readFile(transcriptFile, 'utf-8');
          } catch {
            // Fall back to whisper (Python package)
            try {
              await execAsync('which whisper');
              await execAsync(
                `whisper "${audioFile}" --model tiny --output_format txt --output_dir "${tempDirRef.current}"`,
              );
              const transcriptFile = audioFile.replace('.wav', '.txt');
              transcript = await readFile(transcriptFile, 'utf-8');
            } catch {
              throw new Error(
                'Whisper not found. Please install faster-whisper or openai-whisper, or configure the path in settings.',
              );
            }
          }
        }
      } catch (err) {
        debugLogger.error('useVoiceInput: transcription failed', err);
        throw err;
      }

      // Clean up transcript (remove timestamps, etc.)
      transcript = transcript
        .split('\n')
        .map((line) =>
          line
            .replace(/^\[\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}\.\d{3}\]\s*/, '')
            .trim(),
        )
        .filter((line) => line.length > 0)
        .join(' ');

      // Emit transcript via event instead of setting state
      // This avoids context propagation causing infinite render loops
      transcriptEmitter.emit('transcript', transcript.trim());

      setState({ isRecording: false, isTranscribing: false, error: null });

      // Clean up temp files
      await unlink(audioFile).catch(() => {});
      const transcriptFile = audioFile.replace('.wav', '.txt');
      await unlink(transcriptFile).catch(() => {});
    } catch (err) {
      setState({
        isRecording: false,
        isTranscribing: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unknown error during transcription',
      });
    }
  }, [config?.whisperPath]);

  const toggleRecording = useCallback(async () => {
    // Prevent overlapping calls (race condition protection)
    if (isTogglingRef.current) {
      debugLogger.log(
        'useVoiceInput: toggleRecording ignored - already in progress',
      );
      return;
    }
    isTogglingRef.current = true;
    try {
      if (state.isRecording) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } finally {
      isTogglingRef.current = false;
    }
  }, [state.isRecording, startRecording, stopRecording]);

  return useMemo(
    () => ({
      state,
      startRecording,
      stopRecording,
      toggleRecording,
    }),
    [state, startRecording, stopRecording, toggleRecording],
  );
}
