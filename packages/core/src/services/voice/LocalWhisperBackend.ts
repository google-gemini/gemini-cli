/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '../../utils/debugLogger.js';
import { tmpdir } from '../../utils/paths.js';
import { resolveExecutable, spawnAsync } from '../../utils/shell-utils.js';
import { coreEvents } from '../../utils/events.js';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { VoiceBackend, VoiceBackendOptions } from './types.js';

const RECORDING_FORMAT = 'wav';
const SAMPLE_RATE = 16000;
const CHANNELS = 1;

/**
 * Voice backend that records a WAV file via sox/arecord and transcribes
 * it using a locally-installed Whisper binary (faster-whisper or openai-whisper).
 *
 * Note: The recording process uses `spawn` directly rather than `spawnAsync`
 * because audio capture requires real-time process control (SIGINT to stop).
 * `spawnAsync` is used for the Whisper transcription step, which is a
 * standard command-and-result invocation.
 *
 * Transcripts are delivered via `coreEvents.emitVoiceTranscript()`.
 */
export class LocalWhisperBackend implements VoiceBackend {
  private recordingProcess: ReturnType<typeof spawn> | null = null;
  private tempDir: string | null = null;
  private audioFile: string | null = null;
  private stderrChunks: Buffer[] = [];

  constructor(
    private readonly options: VoiceBackendOptions,
    private readonly config: { whisperPath?: string } = {},
  ) {}

  async start(): Promise<void> {
    if (this.recordingProcess) {
      debugLogger.log('LocalWhisperBackend: already recording');
      return;
    }

    try {
      this.stderrChunks = [];
      this.tempDir = await mkdtemp(join(tmpdir(), 'gemini-voice-'));
      this.audioFile = join(this.tempDir, `recording.${RECORDING_FORMAT}`);
      let recordingProcess: ReturnType<typeof spawn> | null = null;

      const soxPath = await resolveExecutable('sox');
      if (soxPath) {
        recordingProcess = spawn(soxPath, [
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
          RECORDING_FORMAT,
          this.audioFile,
        ]);
      } else {
        const arecordPath = await resolveExecutable('arecord');
        if (arecordPath) {
          recordingProcess = spawn(arecordPath, [
            '-f',
            'S16_LE',
            '-r',
            SAMPLE_RATE.toString(),
            '-c',
            CHANNELS.toString(),
            '-D',
            'default',
            this.audioFile,
          ]);
        } else {
          throw new Error(
            'Neither sox nor arecord found. Please install one of them.',
          );
        }
      }

      this.recordingProcess = recordingProcess;

      this.recordingProcess.stderr?.on('data', (chunk: Buffer) => {
        this.stderrChunks.push(chunk);
      });

      this.recordingProcess.on('error', (err) => {
        void this.options.onStateChange({
          isRecording: false,
          isTranscribing: false,
          error: `Recording error: ${err.message}`,
        });
      });

      void this.options.onStateChange({
        isRecording: true,
        isTranscribing: false,
        error: null,
      });
    } catch (err) {
      void this.options.onStateChange({
        isRecording: false,
        isTranscribing: false,
        error: err instanceof Error ? err.message : String(err),
      });
      await this.cleanup();
      throw err;
    }
  }

  async cancel(): Promise<void> {
    if (!this.recordingProcess) return;
    const proc = this.recordingProcess;
    this.recordingProcess = null;

    const closePromise = new Promise<void>((resolve) => {
      proc.once('close', () => resolve());
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch (_e) {
          // ignore
        }
        resolve();
      }, 500);
    });

    proc.kill('SIGTERM');
    void this.options.onStateChange({
      isRecording: false,
      isTranscribing: false,
      error: null,
    });

    // Don't block the cancel call. Perform cleanup in the background.
    void closePromise.then(() => this.cleanup());
  }

  async stop(): Promise<void> {
    if (!this.recordingProcess) return;

    const proc = this.recordingProcess;
    this.recordingProcess = null;
    const closePromise = new Promise<void>((resolve) => {
      proc.once('close', () => resolve());
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch (_e) {
          // ignore
        }
        resolve();
      }, 500);
    });
    proc.kill('SIGTERM');

    // Wait for the recording process to fully close (stdio streams flushed)
    // before reading the audio file.
    await closePromise;

    await this.options.onStateChange({
      isRecording: false,
      isTranscribing: true,
      error: null,
    });

    try {
      if (!this.audioFile) throw new Error('No audio file');

      const stats = await stat(this.audioFile).catch(() => null);
      if (!stats || stats.size === 0) {
        const stderrStr = Buffer.concat(this.stderrChunks)
          .toString('utf8')
          .trim();
        throw new Error(`No audio recorded (file is empty). ${stderrStr}`);
      }

      const audioBuffer = await readFile(this.audioFile);
      if (this.isSilentWav(audioBuffer)) {
        void this.options.onStateChange({
          isRecording: false,
          isTranscribing: false,
          error:
            'Audio discarded (too quiet). Try speaking louder or adjust threshold: /voice sensitivity',
        });
        return;
      }

      const transcript = await this.transcribe(this.audioFile);
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

  private async transcribe(audioFile: string): Promise<string> {
    // Reject paths with shell metacharacters that could enable injection
    const validatePath = (p: string): string => {
      const sanitized = p.replace(/['"]/g, '');
      if (/[;&|`$(){}[\]<>!]/.test(sanitized))
        throw new Error('Invalid binary path: contains shell metacharacters');
      return sanitized;
    };

    const args = [
      audioFile,
      '--model',
      'tiny',
      '--output_format',
      'txt',
      '--output_dir',
      this.tempDir!,
    ];

    if (this.config.whisperPath) {
      await spawnAsync(validatePath(this.config.whisperPath), args);
    } else {
      try {
        await spawnAsync('whisper-faster', args);
      } catch {
        try {
          await spawnAsync('whisper', args);
        } catch {
          throw new Error(
            'Whisper not found. Please install faster-whisper or openai-whisper, ' +
              'or configure the path in settings.',
          );
        }
      }
    }

    const transcriptFile = audioFile.replace('.wav', '.txt');
    const raw = await readFile(transcriptFile, 'utf-8');
    return raw
      .split('\n')
      .map((l) =>
        l
          .replace(/^\[\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}\.\d{3}\]\s*/, '')
          .trim(),
      )
      .filter(Boolean)
      .join(' ');
  }

  async cleanup(): Promise<void> {
    if (this.tempDir) {
      await rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
      this.tempDir = null;
      this.audioFile = null;
    }
  }

  private isSilentWav(wavBuffer: Buffer): boolean {
    const threshold = this.options.silenceThreshold ?? 80;
    if (threshold === 0) return false;

    const pcmData = this.extractWavDataChunk(wavBuffer);
    if (!pcmData || pcmData.length < 2) {
      return false;
    }

    const samples = Math.floor(pcmData.length / 2);
    if (samples === 0) return true;

    let sumSquares = 0;
    for (let i = 0; i < samples * 2; i += 2) {
      const sample = pcmData.readInt16LE(i);
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / samples);
    return rms < threshold;
  }

  private extractWavDataChunk(wavBuffer: Buffer): Buffer | null {
    if (
      wavBuffer.length < 12 ||
      wavBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
      wavBuffer.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      return null;
    }

    let offset = 12;
    while (offset + 8 <= wavBuffer.length) {
      const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
      const chunkSize = wavBuffer.readUInt32LE(offset + 4);
      const chunkStart = offset + 8;
      const chunkEnd = chunkStart + chunkSize;

      if (chunkEnd > wavBuffer.length) {
        return null;
      }

      if (chunkId === 'data') {
        return wavBuffer.subarray(chunkStart, chunkEnd);
      }

      offset = chunkEnd + (chunkSize % 2);
    }

    return null;
  }
}
