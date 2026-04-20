/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * External command-based text-to-speech provider.
 *
 * Pipes text to an external TTS command that either plays audio
 * directly or writes it to a file. This allows integration with
 * any TTS engine that accepts text on stdin or as an argument.
 *
 * Example commands:
 *   - piper:      `piper --model en_US-lessac-medium --output-raw | aplay -r 22050 -f S16_LE`
 *   - festival:   `festival --tts`
 *   - mimic3:     `mimic3 --voice en_US/cmu-arctic_low`
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { TTSProvider } from '../types.js';

/** Configuration for the external TTS provider. */
export interface ExternalTTSOptions {
  /** Path to the TTS command. */
  command: string;
  /** Arguments to pass to the command. */
  args?: string[];
  /**
   * How text is delivered to the command:
   * - 'stdin': text is written to the process's stdin (default)
   * - 'argument': text is appended as the last argument
   */
  inputMode?: 'stdin' | 'argument';
}

/**
 * TTS provider that delegates to an external command-line tool.
 */
export class ExternalTTSProvider implements TTSProvider {
  private process: ChildProcess | null = null;
  private _isSpeaking = false;
  private finishHandler: (() => void) | null = null;
  private readonly command: string;
  private readonly args: string[];
  private readonly inputMode: 'stdin' | 'argument';

  constructor(options: ExternalTTSOptions) {
    this.command = options.command;
    this.args = options.args ?? [];
    this.inputMode = options.inputMode ?? 'stdin';
  }

  /**
   * Speak the given text using the external TTS command.
   */
  async speak(text: string): Promise<void> {
    if (this._isSpeaking) {
      await this.stop();
    }

    const commandArgs =
      this.inputMode === 'argument' ? [...this.args, text] : [...this.args];

    return new Promise<void>((resolve, reject) => {
      try {
        this.process = spawn(this.command, commandArgs, {
          stdio: [
            this.inputMode === 'stdin' ? 'pipe' : 'ignore',
            'ignore',
            'pipe',
          ],
        });
      } catch (err) {
        reject(
          new Error(
            `Failed to start external TTS process "${this.command}": ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
        return;
      }

      this._isSpeaking = true;

      // If using stdin mode, write the text and close stdin.
      if (this.inputMode === 'stdin' && this.process.stdin) {
        this.process.stdin.write(text);
        this.process.stdin.end();
      }

      this.process.on('error', (err: Error) => {
        this._isSpeaking = false;
        reject(
          new Error(
            `External TTS process error: ${err.message}. ` +
              `Ensure "${this.command}" is installed and available on your PATH.`,
          ),
        );
      });

      this.process.on('close', (code: number | null) => {
        this._isSpeaking = false;
        this.process = null;
        this.finishHandler?.();

        if (code !== null && code !== 0) {
          reject(new Error(`External TTS process exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

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
}
