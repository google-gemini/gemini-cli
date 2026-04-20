/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * System text-to-speech provider using platform-native TTS commands.
 *
 * - macOS:   `say` command
 * - Linux:   `espeak-ng` or `spd-say`
 * - Windows: PowerShell with `System.Speech.Synthesis.SpeechSynthesizer`
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { TTSProvider } from '../types.js';

/** Configuration for the system TTS provider. */
export interface SystemTTSOptions {
  /** Voice name to use (platform-specific). */
  voice?: string;
  /** Speech rate. Interpretation varies by platform. */
  rate?: number;
  /** Override the platform auto-detection ("darwin" | "linux" | "win32"). */
  platform?: string;
}

/**
 * TTS provider that uses the operating system's built-in speech synthesis.
 */
export class SystemTTSProvider implements TTSProvider {
  private process: ChildProcess | null = null;
  private _isSpeaking = false;
  private finishHandler: (() => void) | null = null;
  private readonly voice?: string;
  private readonly rate?: number;
  private readonly platform: string;

  constructor(options: SystemTTSOptions = {}) {
    this.voice = options.voice;
    this.rate = options.rate;
    this.platform = options.platform ?? process.platform;
  }

  /**
   * Speak the given text using the system TTS.
   * Resolves when speech finishes or is interrupted.
   */
  async speak(text: string): Promise<void> {
    // If already speaking, stop the current utterance first.
    if (this._isSpeaking) {
      await this.stop();
    }

    const { command, args } = this.getTTSCommand(text);

    return new Promise<void>((resolve, reject) => {
      try {
        this.process = spawn(command, args, {
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      } catch (err) {
        reject(
          new Error(
            `Failed to start TTS process "${command}": ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
        return;
      }

      this._isSpeaking = true;

      this.process.on('error', (err: Error) => {
        this._isSpeaking = false;
        reject(
          new Error(
            `TTS process error: ${err.message}. ` +
              `Ensure "${command}" is installed and available on your PATH.`,
          ),
        );
      });

      this.process.on('close', (code: number | null) => {
        this._isSpeaking = false;
        this.process = null;
        this.finishHandler?.();

        if (code !== null && code !== 0) {
          reject(new Error(`TTS process exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Stop any currently playing speech.
   */
  async stop(): Promise<void> {
    if (!this._isSpeaking || !this.process) {
      return;
    }

    this._isSpeaking = false;
    this.process.kill('SIGTERM');
    this.process = null;
  }

  isSpeaking(): boolean {
    return this._isSpeaking;
  }

  onFinish(handler: () => void): void {
    this.finishHandler = handler;
  }

  /**
   * Returns the platform-specific TTS command and arguments.
   */
  private getTTSCommand(text: string): { command: string; args: string[] } {
    switch (this.platform) {
      case 'darwin': {
        const args: string[] = [];
        if (this.voice) {
          args.push('-v', this.voice);
        }
        if (this.rate !== undefined) {
          args.push('-r', String(this.rate));
        }
        args.push(text);
        return { command: 'say', args };
      }

      case 'linux': {
        const args: string[] = [];
        if (this.voice) {
          args.push('-v', this.voice);
        }
        if (this.rate !== undefined) {
          args.push('-s', String(this.rate));
        }
        args.push(text);
        return { command: 'espeak-ng', args };
      }

      case 'win32': {
        // Use PowerShell to invoke .NET speech synthesis.
        const escapedText = text.replace(/'/g, "''");
        const voiceSelection = this.voice
          ? `$synth.SelectVoice('${this.voice.replace(/'/g, "''")}');`
          : '';
        const rateSelection =
          this.rate !== undefined ? `$synth.Rate = ${this.rate};` : '';
        const script = [
          'Add-Type -AssemblyName System.Speech;',
          '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
          voiceSelection,
          rateSelection,
          `$synth.Speak('${escapedText}');`,
        ]
          .filter(Boolean)
          .join(' ');

        return {
          command: 'powershell',
          args: ['-NoProfile', '-Command', script],
        };
      }

      default:
        throw new Error(
          `Unsupported platform for system TTS: ${this.platform}`,
        );
    }
  }
}
