/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VoiceInputState {
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
}

export interface VoiceBackend {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Cancel recording without transcribing (e.g., user pressed Escape). */
  cancel(): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * Options passed to a VoiceBackend at construction time.
 * Transcripts are delivered via coreEvents (CoreEvent.VoiceTranscript)
 * rather than a callback, to align with the project's cross-service
 * communication pattern.
 */
export interface VoiceBackendOptions {
  onStateChange: (state: VoiceInputState) => void | Promise<void>;
  /**
   * RMS energy threshold below which audio is treated as silence and
   * discarded without an API call. 0 disables silence detection entirely.
   * Default: 80 (allows whispered speech; blocks near-silence).
   */
  silenceThreshold?: number;
}

export interface VoiceInputReturn {
  isEnabled: boolean;
  state: VoiceInputState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  toggleRecording: () => Promise<void>;
}
