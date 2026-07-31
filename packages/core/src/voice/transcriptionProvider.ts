/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EventEmitter } from 'node:events';

export interface TranscriptionEvents {
  /** Emitted when partial or full transcription text is available. */
  transcription: [string];
  /** Emitted when a speaking turn is considered complete. */
  turnComplete: [];
  /** Emitted when an error occurs during transcription. */
  error: [Error];
  /** Emitted when the transcription service connection is closed. */
  close: [];
}

/**
 * Common interface for all transcription backends (Cloud or Local).
 */
export interface TranscriptionProvider
  extends EventEmitter<TranscriptionEvents> {
  /** Establish connection to the transcription service. */
  connect(): Promise<void>;
  /** Send a chunk of raw audio data to the service. */
  sendAudioChunk(chunk: Buffer): void;
  /** Disconnect from the transcription service. */
  disconnect(): void;
  /** Get the current full transcription for the session. */
  getTranscription(): string;
}
