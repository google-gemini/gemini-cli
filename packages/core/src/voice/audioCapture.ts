/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Audio input capture using platform-specific external commands.
 *
 * Spawns a child process that records raw PCM audio from the default
 * microphone and emits {@link AudioChunk} events. No native Node.js
 * audio bindings are required -- only standard CLI recording tools:
 *
 * - macOS: `rec` (SoX) or `sox`
 * - Linux: `arecord` (ALSA) or `parecord` (PulseAudio)
 * - Windows: PowerShell with .NET `System.Speech` or `sox`
 */

import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { AudioChunk } from './types.js';

/** Events emitted by {@link AudioCapture}. */
export interface AudioCaptureEvents {
  data: (chunk: AudioChunk) => void;
  error: (err: Error) => void;
  started: () => void;
  stopped: () => void;
}

/** Options for constructing an {@link AudioCapture} instance. */
export interface AudioCaptureOptions {
  /** Sample rate in Hz. Defaults to 16000. */
  sampleRate?: number;
  /** Number of channels. Defaults to 1 (mono). */
  channels?: number;
  /** Bits per sample. Defaults to 16. */
  bitDepth?: number;
  /** Override the recording command and arguments. */
  customCommand?: { command: string; args: string[] };
}

/**
 * Captures audio from the system microphone by spawning a platform-
 * specific recording process that writes raw PCM to stdout.
 */
export class AudioCapture extends EventEmitter {
  private process: ChildProcess | null = null;
  private _isCapturing = false;
  private readonly sampleRate: number;
  private readonly channels: number;
  private readonly bitDepth: number;
  private readonly customCommand?: { command: string; args: string[] };
  private currentLevel = 0;

  constructor(options: AudioCaptureOptions = {}) {
    super();
    this.sampleRate = options.sampleRate ?? 16000;
    this.channels = options.channels ?? 1;
    this.bitDepth = options.bitDepth ?? 16;
    this.customCommand = options.customCommand;
  }

  /**
   * Returns the recording command and arguments for the current platform.
   */
  private getRecordCommand(): { command: string; args: string[] } {
    if (this.customCommand) {
      return this.customCommand;
    }

    const rate = String(this.sampleRate);
    const channels = String(this.channels);
    const bits = String(this.bitDepth);

    switch (process.platform) {
      case 'darwin':
        // SoX `rec` outputs raw signed-integer PCM to stdout.
        return {
          command: 'rec',
          args: [
            '-q', // quiet
            '-r',
            rate, // sample rate
            '-c',
            channels, // channels
            '-b',
            bits, // bit depth
            '-e',
            'signed-integer',
            '-t',
            'raw', // raw PCM output
            '-', // write to stdout
          ],
        };

      case 'linux':
        // ALSA arecord outputs raw PCM to stdout.
        return {
          command: 'arecord',
          args: [
            '-q', // quiet
            '-r',
            rate, // sample rate
            '-c',
            channels, // channels
            '-f',
            `S${bits}_LE`, // format: signed 16-bit little-endian
            '-t',
            'raw', // raw PCM output
          ],
        };

      case 'win32':
        // Use SoX on Windows (available via `choco install sox`).
        return {
          command: 'sox',
          args: [
            '-q',
            '-d', // default audio device
            '-r',
            rate,
            '-c',
            channels,
            '-b',
            bits,
            '-e',
            'signed-integer',
            '-t',
            'raw',
            '-',
          ],
        };

      default:
        throw new Error(
          `Unsupported platform for audio capture: ${process.platform}`,
        );
    }
  }

  /**
   * Starts capturing audio from the microphone.
   * Emits 'data' events with {@link AudioChunk} payloads.
   */
  start(): void {
    if (this._isCapturing) {
      return;
    }

    const { command, args } = this.getRecordCommand();

    try {
      this.process = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error(`Failed to spawn recording process: ${String(err)}`);
      this.emit('error', error);
      return;
    }

    this._isCapturing = true;

    this.process.stdout?.on('data', (data: Buffer) => {
      this.currentLevel = this.computeRMSLevel(data);
      const chunk: AudioChunk = {
        data,
        sampleRate: this.sampleRate,
        channels: this.channels,
        bitDepth: this.bitDepth,
      };
      this.emit('data', chunk);
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        this.emit('error', new Error(`Recording process stderr: ${message}`));
      }
    });

    this.process.on('error', (err: Error) => {
      this._isCapturing = false;
      this.emit(
        'error',
        new Error(
          `Recording process error: ${err.message}. ` +
            `Ensure "${command}" is installed and available on your PATH.`,
        ),
      );
    });

    this.process.on('close', (code: number | null) => {
      this._isCapturing = false;
      if (code !== null && code !== 0) {
        this.emit(
          'error',
          new Error(`Recording process exited with code ${code}`),
        );
      }
      this.emit('stopped');
    });

    this.emit('started');
  }

  /**
   * Stops the recording process and cleans up.
   */
  stop(): void {
    if (!this._isCapturing || !this.process) {
      return;
    }

    this._isCapturing = false;
    this.process.kill('SIGTERM');
    this.process = null;
    this.currentLevel = 0;
  }

  /** Whether audio is currently being captured. */
  get isCapturing(): boolean {
    return this._isCapturing;
  }

  /**
   * Returns the current audio level as a normalized value between 0 and 1,
   * suitable for driving a waveform visualization.
   */
  getLevel(): number {
    return this.currentLevel;
  }

  /**
   * Computes the RMS (root mean square) energy of a raw PCM buffer,
   * normalized to a 0-1 range.
   */
  private computeRMSLevel(data: Buffer): number {
    if (data.length < 2) {
      return 0;
    }

    const bytesPerSample = this.bitDepth / 8;
    const numSamples = Math.floor(data.length / bytesPerSample);
    if (numSamples === 0) {
      return 0;
    }

    let sumSquares = 0;
    for (let i = 0; i < numSamples; i++) {
      const offset = i * bytesPerSample;
      // Read as signed 16-bit little-endian (most common PCM format).
      const sample =
        bytesPerSample === 2 ? data.readInt16LE(offset) : data.readInt8(offset);
      const maxVal = bytesPerSample === 2 ? 32768 : 128;
      const normalized = sample / maxVal;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / numSamples);
    // Clamp to 0-1 range.
    return Math.min(1, rms);
  }
}
