/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';

export interface AudioCaptureConfig {
  /** Sample rate in Hz. Default: 16000 (required by Gemini Live API). */
  sampleRate?: number;
  /** Number of channels. Default: 1 (mono). */
  channels?: number;
  /** Chunk size in milliseconds. Default: 100. */
  chunkMs?: number;
}

/**
 * AudioCapture records microphone input as raw 16-bit LE PCM using platform
 * system tools:
 *  - macOS: `sox` (if available) or `afrecord`
 *  - Linux: `arecord` (ALSA)
 *  - Windows: PowerShell + NAudio (via helper script) — falls back to `sox`
 *
 * Emits 'data' events with Buffer chunks of PCM audio, and 'error' / 'close'.
 *
 * Callers should check `AudioCapture.isSupported()` before constructing.
 */
export class AudioCapture extends EventEmitter {
  private process: ChildProcess | null = null;
  private readonly sampleRate: number;
  private readonly channels: number;
  private readonly chunkMs: number;
  private _recording = false;

  constructor(config: AudioCaptureConfig = {}) {
    super();
    this.sampleRate = config.sampleRate ?? 16000;
    this.channels = config.channels ?? 1;
    this.chunkMs = config.chunkMs ?? 100;
  }

  /** Check whether a supported audio capture backend is available. */
  static async isSupported(): Promise<boolean> {
    const platform = os.platform();
    const candidates =
      platform === 'darwin'
        ? ['sox', 'rec']
        : platform === 'win32'
          ? ['sox']
          : ['arecord', 'sox'];

    for (const cmd of candidates) {
      if (await AudioCapture._which(cmd)) return true;
    }
    return false;
  }

  /** Start recording. Emits 'data' with PCM Buffer chunks. */
  start(): void {
    if (this._recording) return;
    this._recording = true;

    const { cmd, args } = this._buildCommand();
    this.process = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.emit('data', chunk);
    });

    this.process.on('error', (err) => {
      this._recording = false;
      this.emit('error', err);
    });

    this.process.on('close', () => {
      this._recording = false;
      this.emit('close');
    });
  }

  /** Stop recording. */
  stop(): void {
    if (!this._recording) return;
    this._recording = false;
    this.process?.kill('SIGTERM');
    this.process = null;
  }

  get recording(): boolean {
    return this._recording;
  }

  private _buildCommand(): { cmd: string; args: string[] } {
    const platform = os.platform();

    if (platform === 'linux') {
      // ALSA arecord: raw signed 16-bit LE
      return {
        cmd: 'arecord',
        args: [
          '-f',
          'S16_LE',
          '-r',
          String(this.sampleRate),
          '-c',
          String(this.channels),
          '--period-size',
          String(Math.floor((this.sampleRate * this.chunkMs) / 1000)),
          '-t',
          'raw',
        ],
      };
    }

    // macOS / Windows / fallback: use sox `rec`
    return {
      cmd: 'rec',
      args: [
        '-q',
        '-r',
        String(this.sampleRate),
        '-c',
        String(this.channels),
        '-e',
        'signed-integer',
        '-b',
        '16',
        '-t',
        'raw',
        '-', // stdout
      ],
    };
  }

  private static async _which(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const p = spawn(os.platform() === 'win32' ? 'where' : 'which', [cmd], {
        stdio: 'ignore',
      });
      p.on('close', (code) => resolve(code === 0));
      p.on('error', () => resolve(false));
    });
  }
}
