/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { LiveTranscriptionService } from '../packages/core/src/voice/liveTranscriptionService.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Voice Dictation Mode Integration', () => {
  let apiKey = '';

  beforeAll(() => {
    // Load from test rig or fallback to environment variable
    apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      const configPath = path.join(os.homedir(), '.gemini', 'config.yaml');
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const match = configContent.match(/apiKey:\s*(["']?)(.*?)\1/);
        if (match) apiKey = match[2];
      }
    }
  });

  it('should connect to the Live API and receive transcription for synthetic audio', async () => {
    if (!apiKey) {
      console.warn('Skipping test: No API key found in ~/.gemini/config.yaml');
      return;
    }

    const service = new LiveTranscriptionService(apiKey);
    let transcriptionReceived = false;
    let finalTranscription = '';

    service.on('transcription', (text) => {
      transcriptionReceived = true;
      finalTranscription = text;
    });

    service.on('error', (err) => {
      console.error('Service Error:', err);
    });

    service.on('close', () => {
      console.log('Service Closed');
    });

    await service.connect();

    // Generate 2 seconds of synthetic sound (white noise mixed with a tone)
    const sampleRate = 16000;
    const duration = 2; // seconds
    const numSamples = sampleRate * duration;
    const buf = Buffer.alloc(numSamples * 2);

    for (let i = 0; i < numSamples; i++) {
      // Mix a sine wave with some noise to ensure it's not "dead" silence
      const sine = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
      const noise = Math.random() * 2 - 1;
      const sample = (sine + noise) / 2;
      const intSample = Math.floor(sample * 32767);
      buf.writeInt16LE(intSample, i * 2);
    }

    // Send the synthetic audio in 100ms chunks (1600 samples)
    const samplesPerChunk = 1600;
    for (let i = 0; i < numSamples; i += samplesPerChunk) {
      const end = Math.min(i + samplesPerChunk, numSamples);
      const chunk = buf.subarray(i * 2, end * 2);
      service.sendAudioChunk(chunk);
      // Wait a bit to simulate real-time
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    service.endAudioStream();

    // Wait for the server to process and respond (up to 10 seconds)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, 10000);

      // Check periodically
      const interval = setInterval(() => {
        if (transcriptionReceived) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 500);
    });

    service.disconnect();

    // Assert that we received something back from the Live API
    expect(transcriptionReceived).toBe(true);
    expect(finalTranscription.length).toBeGreaterThan(0);
  }, 10000);
});
