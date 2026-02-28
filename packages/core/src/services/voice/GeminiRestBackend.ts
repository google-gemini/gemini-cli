/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '../../config/config.js';
import { coreEvents } from '../../utils/events.js';
import { resolveExecutable } from '../../utils/shell-utils.js';
import { LlmRole } from '../../telemetry/llmRole.js';
import { spawn } from 'node:child_process';
import type { VoiceBackend, VoiceBackendOptions } from './types.js';
import type { GenerateContentParameters } from '@google/genai';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;

/**
 * Voice backend that uses the Gemini API for transcription.
 *
 * Records raw PCM audio in-memory via sox or arecord, then builds a WAV
 * buffer and sends it to the Gemini API using the CLI's existing
 * ContentGenerator (works with both API key and OAuth auth).
 *
 * Note: The recording process uses `spawn` directly rather than `spawnAsync`
 * because audio capture requires streaming binary stdout chunk-by-chunk in
 * real-time. `spawnAsync` buffers all output until the process exits, which
 * is incompatible with the push-to-talk recording pattern.
 *
 * Transcripts are delivered via `coreEvents.emitVoiceTranscript()`.
 */
export class GeminiRestBackend implements VoiceBackend {
  private recordingProcess: ReturnType<typeof spawn> | null = null;
  private audioChunks: Buffer[] = [];
  private isStopping = false;

  constructor(
    private readonly options: VoiceBackendOptions,
    private readonly config: Config,
  ) {}

  async start(): Promise<void> {
    if (this.recordingProcess) return;

    try {
      this.isStopping = false;
      this.audioChunks = [];
      void this.options.onStateChange({
        isRecording: true,
        isTranscribing: false,
        error: null,
      });

      const soxPath = await resolveExecutable('sox');
      if (soxPath) {
        this.recordingProcess = spawn(soxPath, [
          '-d',
          '-b',
          '16',
          '-r',
          SAMPLE_RATE.toString(),
          '-c',
          CHANNELS.toString(),
          '-e',
          'signed-integer',
          '-t',
          'raw',
          '-',
        ]);
      } else {
        const arecordPath = await resolveExecutable('arecord');
        if (arecordPath) {
          this.recordingProcess = spawn(arecordPath, [
            '-f',
            'S16_LE',
            '-r',
            SAMPLE_RATE.toString(),
            '-c',
            CHANNELS.toString(),
            '-t',
            'raw',
            '-D',
            'default',
          ]);
        } else {
          throw new Error(
            'Neither sox nor arecord found.\n' +
              '  macOS:  brew install sox\n' +
              '  Linux:  sudo apt install sox  (or: sudo apt install alsa-utils)',
          );
        }
      }

      this.recordingProcess.stdout?.on('data', (chunk: Buffer) => {
        if (!this.isStopping) {
          this.audioChunks.push(chunk);
        }
      });

      this.recordingProcess.on('error', (err) => {
        void this.options.onStateChange({
          isRecording: false,
          isTranscribing: false,
          error: `Recording error: ${err.message}`,
        });
      });
    } catch (err) {
      void this.options.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async cancel(): Promise<void> {
    if (!this.recordingProcess) return;
    this.isStopping = true;
    const proc = this.recordingProcess;
    this.recordingProcess = null;
    proc.kill('SIGINT');
    this.audioChunks = [];
    void this.options.onStateChange({
      isRecording: false,
      isTranscribing: false,
      error: null,
    });
  }

  async stop(): Promise<void> {
    if (!this.recordingProcess) return;

    this.isStopping = true;
    const proc = this.recordingProcess;
    this.recordingProcess = null;
    proc.kill('SIGINT');

    try {
      const audioBuffer = Buffer.concat(this.audioChunks);
      if (audioBuffer.length === 0) throw new Error('No audio captured');

      // Reject silent recordings before showing the transcribing state, so
      // the ⏳ indicator only appears when an actual API call will be made.
      // RMS of 16-bit LE PCM: background noise <200, audible speech ~500+.
      if (this.isSilentPcm(audioBuffer)) {
        void this.options.onStateChange({
          isRecording: false,
          isTranscribing: false,
          error: null,
        });
        return;
      }

      // Signal transcription only now — the ⏳ will be visible for the
      // full duration of the Gemini API call. Awaiting allows the UI layer
      // to flush the state change before the network call begins.
      await this.options.onStateChange({
        isRecording: false,
        isTranscribing: true,
        error: null,
      });

      const wavBuffer = this.createWavBuffer(audioBuffer, SAMPLE_RATE);
      const transcript = await this.transcribe(wavBuffer);
      coreEvents.emitVoiceTranscript(transcript);

      void this.options.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: null,
      });
    } catch (err) {
      void this.options.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Builds a WAV buffer from raw 16-bit LE PCM data.
   * Gemini's audio/wav MIME type requires a valid RIFF header.
   */
  private createWavBuffer(pcmBuffer: Buffer, sampleRate: number): Buffer {
    const header = Buffer.alloc(44);
    const dataSize = pcmBuffer.length;

    header.write('RIFF', 0);
    header.writeUInt32LE(dataSize + 36, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // format chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(CHANNELS, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * CHANNELS * 2, 28); // byte rate
    header.writeUInt16LE(CHANNELS * 2, 32); // block align
    header.writeUInt16LE(16, 34); // bits per sample
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  private async transcribe(audioBuffer: Buffer): Promise<string> {
    const generator = this.config.getContentGenerator();
    if (!generator) throw new Error('Gemini API not initialized');

    const request: GenerateContentParameters = {
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Transcribe the following audio exactly as spoken. Output only the transcribed text with no additional commentary or formatting.',
            },
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: audioBuffer.toString('base64'),
              },
            },
          ],
        },
      ],
    };

    const response = await generator.generateContent(
      request,
      'voice-transcription',
      LlmRole.UTILITY_TOOL,
    );

    const parts = response.candidates?.[0]?.content?.parts;
    return parts?.[0]?.text?.trim() ?? '';
  }

  /**
   * Returns true if the raw 16-bit LE PCM buffer is effectively silent.
   * Computes RMS amplitude and compares against options.silenceThreshold
   * (default 80). A threshold of 0 disables silence detection entirely.
   *
   * RMS guide (16-bit PCM, 16 kHz mono):
   *   ~0-30    near-digital silence
   *   ~30-100  quiet room ambient / electrical noise
   *   ~100-400 whispered speech
   *   ~500+    normal conversational speech
   */
  private isSilentPcm(pcmBuffer: Buffer): boolean {
    const threshold = this.options.silenceThreshold ?? 80;
    if (threshold === 0) return false; // disabled
    const samples = pcmBuffer.length / 2; // 16-bit = 2 bytes per sample
    if (samples === 0) return true;
    let sumSquares = 0;
    for (let i = 0; i < pcmBuffer.length - 1; i += 2) {
      const sample = pcmBuffer.readInt16LE(i);
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / samples);
    return rms < threshold;
  }

  async cleanup(): Promise<void> {
    if (this.recordingProcess) {
      this.recordingProcess.kill('SIGINT');
      this.recordingProcess = null;
    }
    this.audioChunks = [];
  }
}
