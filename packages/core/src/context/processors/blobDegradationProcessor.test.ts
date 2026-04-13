/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import { describe, it, expect } from 'vitest';
import { createBlobDegradationProcessor } from './blobDegradationProcessor.js';
import {
  createMockProcessArgs,
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import type { UserPrompt, SemanticPart, ConcreteNode } from '../graph/types.js';

describe('BlobDegradationProcessor', () => {
  it('should ignore text parts and only target inline_data and file_data', async () => {
    const env = createMockEnvironment();
    // charsPerToken = 1
    // We want the degraded text to be cheaper than the original blob.
    // Degraded text is ~100 chars ("...degraded to text...").
    // So we make the blob data 200 chars.
    const fakeData = 'A'.repeat(200);

    const processor = createBlobDegradationProcessor(
      'BlobDegradationProcessor',
      env,
    );

    const parts: SemanticPart[] = [
      { type: 'text', text: 'Hello' },
      { type: 'inline_data', mimeType: 'image/png', data: fakeData },
      { type: 'text', text: 'World' },
    ];

    const prompt = createDummyNode('ep1', 'USER_PROMPT', 100, {
      semanticParts: parts,
    }) as UserPrompt;

    const targets = [prompt];

    const result = await processor.process(createMockProcessArgs(targets));

    expect(result.length).toBe(1);
    const modifiedPrompt = result[0] as UserPrompt;

    expect(modifiedPrompt.id).not.toBe(prompt.id);
    expect(modifiedPrompt.semanticParts.length).toBe(3);

    // Text parts should be untouched
    expect(modifiedPrompt.semanticParts[0]).toEqual(parts[0]);
    expect(modifiedPrompt.semanticParts[2]).toEqual(parts[2]);

    // The inline_data part should be replaced with text
    const degradedPart = modifiedPrompt.semanticParts[1];
    expect(degradedPart.type).toBe('text');
    assert(degradedPart.type === 'text');
    expect(degradedPart.text).toContain(
      '[Multi-Modal Blob (image/png, 0.00MB) degraded to text',
    );
  });

  it('should degrade all blobs unconditionally', async () => {
    const env = createMockEnvironment();

    const processor = createBlobDegradationProcessor(
      'BlobDegradationProcessor',
      env,
    );

    // Tokens for fileData = 258.
    // Degraded text = "[File Reference (video/mp4) degraded to text to preserve context window. Original URI: gs://test1]"
    // Degraded text length ~100 characters.
    // Since charsPerToken=1, degraded text = 100 tokens.
    // Tokens saved = 258 - 100 = 158. This is > 0, so it WILL degrade it!

    const prompt = createDummyNode('ep1', 'USER_PROMPT', 100, {
      semanticParts: [
        { type: 'file_data', mimeType: 'video/mp4', fileUri: 'gs://test1' },
        { type: 'file_data', mimeType: 'video/mp4', fileUri: 'gs://test2' },
      ],
    }) as UserPrompt;

    const targets = [prompt];

    const result = await processor.process(createMockProcessArgs(targets));

    const modifiedPrompt = result[0] as UserPrompt;
    expect(modifiedPrompt.semanticParts.length).toBe(2);

    // Both parts should be degraded
    expect(modifiedPrompt.semanticParts[0].type).toBe('text');
    expect(modifiedPrompt.semanticParts[1].type).toBe('text');
  });

  it('should return exactly the targets array if targets are empty', async () => {
    const env = createMockEnvironment();

    const processor = createBlobDegradationProcessor(
      'BlobDegradationProcessor',
      env,
    );
    const targets: ConcreteNode[] = [];

    const result = await processor.process(createMockProcessArgs(targets));

    expect(result).toBe(targets);
  });
});
