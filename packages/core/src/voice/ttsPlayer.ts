/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { EventEmitter } from 'node:events';

/**
 * TtsPlayer plays raw PCM audio chunks (16-bit LE, 24kHz, mono — the format
 * returned by the Gemini Live API) through the system audio output.
 *
 * Platform backends:
 *  - macOS: `afplay` (via temporary AIFF pipe) or `sox play`
 *  - Linux: `aplay` (ALSA)
 *  - Windows: PowerShell `[System.Media.SoundPlayer]` or `sox play`
 *
 * Chunks are queued and played sequentially so that back-to-back audio
 * segments from the Live API are seamlessly concatenated.
 */
export class TtsPlayer extends EventEmitter {
  private player: ChildProcess | null = null;
  private readonly sampleRate: number;
  private readonly channels: number;
  private _playing = false;

  constructor(opts: { sampleRate?: number; channels?: number } = {}) {
    super();
    this.sampleRate = opts.sampleRate ?? 24000;
    this.channels = opts.channels ?? 1;
  }

  /**
   * Write a PCM chunk to the audio output.
   * Opens the player process on first call; subsequent chunks are piped in.
   */
  write(pcm: Buffer): void {
    if (!this.player) {
      this._openPlayer();
    }
    this.player?.stdin?.write(pcm);
  }

  /** Flush and close the current audio stream. */
  flush(): void {
    this.player?.stdin?.end();
    this.player = null;
    this._playing = false;
  }

  /** Immediately stop playback (for interruption support). */
  stop(): void {
    this.player?.kill('SIGTERM');
    this.player = null;
    this._playing = false;
    this.emit('stopped');
  }

  get playing(): boolean {
    return this._playing;
  }

  private _openPlayer(): void {
    const { cmd, args } = this._buildCommand();
    this.player = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    this._playing = true;

    this.player.on('close', () => {
      this._playing = false;
      this.player = null;
      this.emit('done');
    });

    this.player.on('error', (err) => {
      this._playing = false;
      this.player = null;
      this.emit('error', err);
    });
  }

  private _buildCommand(): { cmd: string; args: string[] } {
    const platform = os.platform();

    if (platform === 'linux') {
      return {
        cmd: 'aplay',
        args: [
          '-f',
          'S16_LE',
          '-r',
          String(this.sampleRate),
          '-c',
          String(this.channels),
          '-t',
          'raw',
          '-',
        ],
      };
    }

    // macOS / Windows / fallback: sox play
    return {
      cmd: 'play',
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
        '-',
      ],
    };
  }
}
