/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import commandExists from 'command-exists';
import { debugLogger } from '../utils/debugLogger.js';
import type {
  TranscriptionProvider,
  TranscriptionEvents,
} from './transcriptionProvider.js';

export interface WhisperProviderOptions {
  modelPath: string;
  threads?: number;
  step?: number;
  length?: number;
}

/**
 * Local transcription provider using `whisper-stream` from whisper.cpp.
 *
 * Uses the Sliding Window Mode with VAD (--step 0) for stable,
 * non-overlapping transcription blocks that can be appended directly.
 */
export class WhisperTranscriptionProvider
  extends EventEmitter<TranscriptionEvents>
  implements TranscriptionProvider
{
  private process: ChildProcessWithoutNullStreams | null = null;
  private currentTranscription = '';

  constructor(private readonly options: WhisperProviderOptions) {
    super();
  }

  /**
   * Checks if `whisper-stream` is available on the system.
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await commandExists('whisper-stream');
      return true;
    } catch {
      return false;
    }
  }

  async connect(): Promise<void> {
    const { modelPath, threads = 4, step = 0, length = 5000 } = this.options;

    this.currentTranscription = '';

    const available = await WhisperTranscriptionProvider.isAvailable();
    if (!available) {
      return Promise.reject(
        new Error(
          'The `whisper-stream` command is required for local voice mode. Please install it (e.g., `brew install whisper-cpp` on macOS).',
        ),
      );
    }

    debugLogger.debug(
      `[WhisperTranscription] Starting whisper-stream with model: ${modelPath} (VAD mode: step=${step}, length=${length})`,
    );

    return new Promise((resolve, reject) => {
      let isResolved = false;

      try {
        // whisper-stream -m <model_path> -t <threads> --step 0 --length <length> -vth 0.6
        // Setting step == 0 enables sliding window mode with VAD, which outputs
        // non-overlapping transcription blocks suitable for appending.
        this.process = spawn('whisper-stream', [
          '-m',
          modelPath,
          '-t',
          threads.toString(),
          '--step',
          step.toString(),
          '--length',
          length.toString(),
          '-vth',
          '0.6',
        ]);

        this.process.stdout.on('data', (data: Buffer) => {
          const output = data.toString();
          this.parseOutput(output);
        });

        this.process.stderr.on('data', (data: Buffer) => {
          const msg = data.toString();
          if (msg.includes('error')) {
            debugLogger.error(`[WhisperTranscription] stderr: ${msg}`);
            if (!isResolved) {
              isResolved = true;
              reject(new Error(msg));
            }
          }

          // whisper-stream prints "whisper_init_from_file_with_params_no_state: loading model from..."
          // and finally "main: processing, press Ctrl+C to stop" when ready.
          if (!isResolved && msg.includes('main: processing')) {
            debugLogger.debug('[WhisperTranscription] whisper-stream is ready');
            isResolved = true;
            resolve();
          }
        });

        this.process.on('error', (err) => {
          debugLogger.error('[WhisperTranscription] Process error:', err);
          this.emit('error', err);
          if (!isResolved) {
            isResolved = true;
            reject(err);
          }
        });

        this.process.on('close', (code) => {
          debugLogger.debug(
            `[WhisperTranscription] Process closed with code ${code}`,
          );
          this.emit('close');
          this.process = null;
        });

        // Fallback timeout in case "main: processing" is never seen
        setTimeout(() => {
          if (!isResolved) {
            debugLogger.warn(
              '[WhisperTranscription] Connection timeout (fallback resolve)',
            );
            isResolved = true;
            resolve();
          }
        }, 10000);
      } catch (err) {
        debugLogger.error(
          '[WhisperTranscription] Failed to spawn process:',
          err,
        );
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      }
    });
  }

  private parseOutput(output: string): void {
    // whisper-stream output format: "[00:00:00.000 --> 00:00:02.000]   Hello world."
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/\[.* --> .*\]\s+(.*)/);
      if (match && match[1]) {
        let text = match[1].trim();

        // Filter out [Silence], [music], (laughter), etc.
        text = text
          .replace(/\[[^\]]*\]/g, '')
          .replace(/\([^)]*\)/g, '')
          .trim();

        if (text) {
          // In VAD mode (step=0), each line is a completed speech block.
          // Append it to the buffer to ensure it doesn't disappear.
          this.currentTranscription = this.currentTranscription
            ? `${this.currentTranscription} ${text}`
            : text;

          debugLogger.debug(
            `[WhisperTranscription] Transcription updated (Local-VAD): "${this.currentTranscription}"`,
          );
          this.emit('transcription', this.currentTranscription);
        }
      }
    }
  }

  sendAudioChunk(_chunk: Buffer): void {
    // whisper-stream handles its own audio capture.
  }

  getTranscription(): string {
    return this.currentTranscription;
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }
}
