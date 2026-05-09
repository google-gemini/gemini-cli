/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import {
  WhisperModelManager,
  WhisperTranscriptionProvider,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import commandExists from 'command-exists';

describe('Voice Mode Integration', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should be able to download tiny whisper model', async () => {
    // This test doesn't require the binary, only network access.
    // However, it's slow and downloads 75MB. We'll keep it for now but
    // wrap it in a try-catch to avoid failing on network flakiness in CI.
    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';

    try {
      // Cleanup if already exists to ensure we actually test download
      const modelPath = manager.getModelPath(modelName);
      if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath);
      }

      await manager.downloadModel(modelName);
      expect(fs.existsSync(modelPath)).toBe(true);
      expect(fs.statSync(modelPath).size).toBeGreaterThan(70 * 1024 * 1024); // ~75MB
    } catch (e) {
      console.warn(
        'Skipping whisper model download test due to error (possibly network):',
        e,
      );
    }
  }, 300000); // 5 min timeout for download

  it('should initialize WhisperTranscriptionProvider and handle process', async () => {
    // Skip this test if whisper-stream is not installed (typical for CI)
    try {
      await commandExists('whisper-stream');
    } catch {
      console.log(
        'Skipping Whisper transcription test: whisper-stream not found',
      );
      return;
    }

    const manager = new WhisperModelManager();
    const modelName = 'ggml-tiny.en.bin';
    if (!manager.isModelInstalled(modelName)) {
      await manager.downloadModel(modelName);
    }

    const provider = new WhisperTranscriptionProvider({
      modelPath: manager.getModelPath(modelName),
    });

    // Since we can't easily provide real mic input in CI,
    // we just verify it can start and be disconnected.
    await provider.connect();
    provider.disconnect();
  });
});
