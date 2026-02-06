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

const execAsync = promisify(exec);

export interface VoiceInputState {
  isRecording: boolean;
  isTranscribing: boolean;
  transcript: string | null;
  error: string | null;
}

export interface VoiceInputReturn {
  state: VoiceInputState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  clearTranscript: () => void;
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
    transcript: null,
    error: null,
  });

  const recordingProcessRef = useRef<ReturnType<typeof spawn> | null>(null);
  const tempDirRef = useRef<string | null>(null);
  const audioFileRef = useRef<string | null>(null);
  const sanitizedPathLoggedRef = useRef(false);

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

  const clearTranscript = useCallback(
    () => setState((prev) => ({ ...prev, transcript: null, error: null })),
    [],
  );

  const startRecording = useCallback(async () => {
    try {
      debugLogger.log('useVoiceInput: startRecording called');
      setState((prev) => ({ ...prev, isRecording: true, error: null }));

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
        setState((prev) => ({
          ...prev,
          isRecording: false,
          error: `Recording error: ${err.message}`,
        }));
      });

      recordProcess.on('exit', (code, signal) => {
        debugLogger.log('useVoiceInput: recording process exited', {
          code,
          signal,
        });
      });
    } catch (err) {
      debugLogger.error('useVoiceInput: startRecording error', err);
      setState((prev) => ({
        ...prev,
        isRecording: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unknown error starting recording',
      }));
    }
  }, []);

  const stopRecording = useCallback(async () => {
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

      setState((prev) => ({
        ...prev,
        isRecording: false,
        isTranscribing: true,
      }));

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
            `"${audioFile}" --model tiny --language English --output_format txt --output_dir "${tempDirRef.current}" `,
          );
          // Read the transcript file
          const transcriptFile = audioFile.replace('.wav', '.txt');
          transcript = await readFile(transcriptFile, 'utf-8');
        } else {
          // Try faster-whisper first
          try {
            await execAsync('which whisper-faster || which faster-whisper');
            await execAsync(
              `whisper-faster "${audioFile}" --model tiny --language en --output_format txt --output_dir "${tempDirRef.current}"`,
            );
            // Read the transcript file
            const transcriptFile = audioFile.replace('.wav', '.txt');
            transcript = await readFile(transcriptFile, 'utf-8');
          } catch {
            // Fall back to whisper (Python package)
            try {
              await execAsync('which whisper');
              await execAsync(
                `whisper "${audioFile}" --model tiny --language English --output_format txt --output_dir "${tempDirRef.current}"`,
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

      setState((prev) => ({
        ...prev,
        isTranscribing: false,
        transcript: transcript.trim(),
      }));

      // Clean up temp files
      await unlink(audioFile).catch(() => {});
      const transcriptFile = audioFile.replace('.wav', '.txt');
      await unlink(transcriptFile).catch(() => {});
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isRecording: false,
        isTranscribing: false,
        error:
          err instanceof Error
            ? err.message
            : 'Unknown error during transcription',
      }));
    }
  }, [config?.whisperPath]);

  const toggleRecording = useCallback(async () => {
    debugLogger.log('useVoiceInput: toggleRecording called', {
      isRecording: state.isRecording,
    });
    if (state.isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [state.isRecording, startRecording, stopRecording]);

  return useMemo(
    () => ({
      state,
      startRecording,
      stopRecording,
      toggleRecording,
      clearTranscript,
    }),
    [state, startRecording, stopRecording, toggleRecording, clearTranscript],
  );
}
