/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhisperTranscriptionProvider } from './whisperTranscriptionProvider.js';
import commandExists from 'command-exists';

vi.mock('command-exists', () => ({
  default: vi.fn(),
}));

describe('WhisperTranscriptionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw a friendly error if whisper-stream is not available', async () => {
    vi.mocked(commandExists).mockRejectedValue(new Error('not found'));

    const provider = new WhisperTranscriptionProvider({
      modelPath: 'test-model.bin',
    });

    await expect(provider.connect()).rejects.toThrow(
      'The `whisper-stream` command is required for local voice mode. Please install it (e.g., `brew install whisper-cpp` on macOS).',
    );
  });
});
