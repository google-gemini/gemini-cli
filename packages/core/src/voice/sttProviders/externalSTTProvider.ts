/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * External command-based speech-to-text provider.
 *
 * Pipes raw PCM audio to an external STT command (e.g. whisper.cpp,
 * vosk-cli, or any tool that reads audio from stdin and writes
 * transcription text to stdout). Supports both batch and streaming
 * modes.
 *
 * Example commands:
 *   - whisper.cpp:  `./main -m models/base.en.bin -f -`
 *   - vosk:         `vosk-transcriber --input -`
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { STTProvider, TranscriptResult, AudioChunk } from '../types.js';

/** Configuration for the external STT provider. */
export interface ExternalSTTOptions {
  /** Path to the STT command. */
  command: string;
  /** Arguments to pass to the command. */
  args?: string[];
  /** Language code (e.g. "en-US"). Passed to the handler for transcript results. */
  language?: string;
  /**
   * Whether the command operates in streaming mode (continuously
   * outputs partial transcripts) or batch mode (outputs one result
   * after stdin closes).
   */
  streaming?: boolean;
}

/**
 * STT provider that delegates to an external command-line tool.
 */
export class ExternalSTTProvider implements STTProvider {
  private process: ChildProcess | null = null;
  private transcriptHandler: ((result: TranscriptResult) => void) | null = null;
  private _isListening = false;
  private readonly command: string;
  private readonly args: string[];
  private readonly language: string;
  private readonly streaming: boolean;
  private outputBuffer = '';

  constructor(options: ExternalSTTOptions) {
    this.command = options.command;
    this.args = options.args ?? [];
    this.language = options.language ?? 'en-US';
    this.streaming = options.streaming ?? false;
  }

  /**
   * Spawns the STT process and begins listening for transcripts.
   */
  async start(): Promise<void> {
    if (this._isListening) {
      return;
    }

    this.outputBuffer = '';

    try {
      this.process = spawn(this.command, this.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      throw new Error(
        `Failed to start STT process "${this.command}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    this._isListening = true;

    this.process.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();

      if (this.streaming) {
        // In streaming mode, each line from stdout is a partial or
        // final transcript. Lines prefixed with "[FINAL]" are final.
        const lines = (this.outputBuffer + text).split('\n');
        // Keep the last (potentially incomplete) line in the buffer.
        this.outputBuffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const isFinal = trimmed.startsWith('[FINAL]');
          const transcriptText = isFinal
            ? trimmed.slice('[FINAL]'.length).trim()
            : trimmed;

          if (transcriptText) {
            this.emitTranscript(transcriptText, isFinal);
          }
        }
      } else {
        // Batch mode: accumulate all output.
        this.outputBuffer += text;
      }
    });

    this.process.on('error', (err: Error) => {
      this._isListening = false;
      // Emit an empty error transcript so callers know something went wrong.
      this.transcriptHandler?.({
        text: '',
        confidence: 0,
        isFinal: true,
        language: this.language,
      });
      throw new Error(
        `STT process error: ${err.message}. ` +
          `Ensure "${this.command}" is installed and available on your PATH.`,
      );
    });

    this.process.on('close', () => {
      this._isListening = false;
      // In batch mode, emit the accumulated output as a final transcript.
      if (!this.streaming && this.outputBuffer.trim()) {
        this.emitTranscript(this.outputBuffer.trim(), true);
      }
      this.outputBuffer = '';
    });
  }

  /**
   * Stops the STT process. In batch mode, closes stdin first so the
   * process can produce its final output.
   */
  async stop(): Promise<void> {
    if (!this._isListening || !this.process) {
      return;
    }

    this._isListening = false;

    if (!this.streaming) {
      // Close stdin to signal the batch process to finalize.
      this.process.stdin?.end();
    } else {
      this.process.kill('SIGTERM');
    }

    this.process = null;
  }

  onTranscript(handler: (result: TranscriptResult) => void): void {
    this.transcriptHandler = handler;
  }

  isListening(): boolean {
    return this._isListening;
  }

  /**
   * Feed an audio chunk to the STT process via stdin.
   */
  feedAudio(chunk: AudioChunk): void {
    if (this._isListening && this.process?.stdin?.writable) {
      this.process.stdin.write(chunk.data);
    }
  }

  private emitTranscript(text: string, isFinal: boolean): void {
    this.transcriptHandler?.({
      text,
      confidence: isFinal ? 0.9 : 0.5,
      isFinal,
      language: this.language,
    });
  }
}
