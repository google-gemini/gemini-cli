/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import commandExists from 'command-exists';

export interface AudioRecorderEvents {
  data: [Buffer];
  start: [];
  stop: [];
  error: [Error];
}

/**
 * Captures audio from the microphone using `sox` (`rec`).
 * Emits 16kHz, 16-bit, mono PCM chunks.
 */
export class AudioRecorder extends EventEmitter<AudioRecorderEvents> {
  private recProcess: ChildProcessWithoutNullStreams | null = null;
  private isRecordingInternal = false;

  get isRecording(): boolean {
    return this.isRecordingInternal;
  }

  /**
   * Checks if `rec` (sox) is available on the system.
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await commandExists('rec');
      return true;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.isRecordingInternal) return;
    this.isRecordingInternal = true;

    try {
      const available = await AudioRecorder.isAvailable();
      if (!this.isRecordingInternal) return; // Check if stopped while checking availability

      if (!available) {
        throw new Error(
          'The `rec` command (provided by SoX) is required for voice mode. Please install SoX (e.g., `brew install sox` on macOS or `sudo apt install sox libsox-fmt-all` on Linux).',
        );
      }

      // rec -q -V0 -e signed -c 1 -b 16 -r 16000 -t raw -
      this.recProcess = spawn('rec', [
        '-q',
        '-V0',
        '-e',
        'signed',
        '-c',
        '1',
        '-b',
        '16',
        '-r',
        '16000',
        '-t',
        'raw',
        '-',
      ]);

      if (!this.isRecordingInternal) {
        this.recProcess.kill('SIGTERM');
        this.recProcess = null;
        return;
      }

      this.recProcess.stdout.on('data', (data: Buffer) => {
        this.emit('data', data);
      });

      this.recProcess.stderr.on('data', (_data: Buffer) => {
        // rec might print warnings to stderr, we could log them or ignore
        // console.warn(`rec stderr: ${data.toString()}`);
      });

      this.recProcess.on('error', (err) => {
        this.emit('error', err);
        this.stop();
      });

      this.recProcess.on('close', () => {
        this.stop();
      });

      this.emit('start');
    } catch (err) {
      this.isRecordingInternal = false;
      throw err;
    }
  }

  stop(): void {
    if (!this.isRecordingInternal) return;
    this.isRecordingInternal = false;

    if (this.recProcess) {
      this.recProcess.kill('SIGTERM');
      this.recProcess = null;
    }

    this.emit('stop');
  }
}
