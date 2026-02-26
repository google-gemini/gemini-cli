/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Content } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('resume-repro', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should be able to resume a session without "Storage must be initialized before use"', async () => {
    const responsesPath = path.join(__dirname, 'resume_repro.responses');
    await rig.setup('should be able to resume a session', {
      fakeResponsesPath: responsesPath,
    });

    // 1. First run to create a session
    await rig.run({
      args: 'hello',
    });

    // 2. Second run with --resume latest
    // This should NOT fail with "Storage must be initialized before use"
    const result = await rig.run({
      args: ['--resume', 'latest', 'continue'],
    });

    expect(result).toContain('Session started');
  });

  it('should normalize missing thought signatures in resumed history for modern models', async () => {
    const responsesPath = path.join(
      __dirname,
      'resume_repro_signature_normalization.responses',
    );
    await rig.setup('resume signature normalization for modern model', {
      fakeResponsesPath: responsesPath,
    });

    // First run creates a session where the model emits a functionCall without
    // thoughtSignature (from fake response fixture).
    await rig.run({
      args: [
        '--model',
        'gemini-3-flash-preview',
        '--output-format',
        'json',
        'List files in this folder',
      ],
      timeout: 60000,
    });

    // Resume and send another prompt on the same modern model path.
    const result = await rig.run({
      args: [
        '--resume',
        'latest',
        '--model',
        'gemini-3-flash-preview',
        '--output-format',
        'json',
        'continue',
      ],
      timeout: 60000,
    });
    const parsedResult = JSON.parse(result);
    expect(parsedResult.response).toContain('List complete.');

    const lastApiRequest = rig.readLastApiRequest();
    expect(lastApiRequest).toBeTruthy();

    const requestText = lastApiRequest?.attributes?.request_text;
    expect(typeof requestText).toBe('string');

    const requestContents = JSON.parse(requestText as string) as Content[];
    const modelFunctionCallParts = requestContents
      .filter((c) => c.role === 'model')
      .flatMap((c) => c.parts ?? [])
      .filter((part) => 'functionCall' in part);

    expect(modelFunctionCallParts.length).toBeGreaterThan(0);
    for (const part of modelFunctionCallParts) {
      expect(part).toHaveProperty('thoughtSignature');
    }
  });
});
