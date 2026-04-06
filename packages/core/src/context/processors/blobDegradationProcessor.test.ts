/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { createMockEnvironment } from '../testing/contextTestUtils.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlobDegradationProcessor } from './blobDegradationProcessor.js';
import type { Episode, UserPrompt } from '../ir/types.js';
import type { ContextAccountingState } from '../pipeline.js';
import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';

vi.mock('node:fs/promises');

describe('BlobDegradationProcessor', () => {
  let processor: BlobDegradationProcessor;

  beforeEach(() => {
    vi.resetAllMocks();

    processor = new BlobDegradationProcessor(createMockEnvironment());
  });

  const getDummyState = (
    isSatisfied = false,
    deficit = 0,
    protectedIds = new Set<string>(),
  ): ContextAccountingState => ({
    currentTokens: 5000,
    maxTokens: 10000,
    retainedTokens: 4000,
    deficitTokens: deficit,
    protectedEpisodeIds: protectedIds,
    isBudgetSatisfied: isSatisfied,
  });

  it('degrades inline_data into a text reference and saves to disk', async () => {
    const dummyImageBase64 = Buffer.from('fake-image-data').toString('base64');

    const ep: Episode = {
      id: 'ep-1',
      timestamp: Date.now(),
      trigger: {
        id: randomUUID(),
        type: 'USER_PROMPT',
        semanticParts: [
          { type: 'text', text: 'Look at this image:' },
          {
            type: 'inline_data',
            mimeType: 'image/png',
            data: dummyImageBase64,
          },
        ],
        metadata: {
          originalTokens: 300,
          currentTokens: 300,
          transformations: [],
        },
      },
      steps: [],
    };

    // Fake token calculator says inlineData costs 258 tokens, text costs 10
    const state = getDummyState(false, 500, new Set());
    const result = await processor.process([ep], state);

    const parts = (result[0].trigger as UserPrompt).semanticParts;

    // Text part should be untouched
    expect(parts[0].presentation).toBeUndefined();

    // Inline data should be degraded
    expect(parts[1].presentation).toBeDefined();
    expect(parts[1].presentation!.text).toContain(
      '[Multi-Modal Blob (image/png',
    );
    expect(parts[1].presentation!.text).toContain(
      'degraded to text to preserve context window',
    );

    expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
    expect(result[0].trigger.metadata.transformations.length).toBe(1);
  });

  it('degrades file_data into a text reference without disk write', async () => {
    const ep: Episode = {
      id: 'ep-2',
      timestamp: Date.now(),
      trigger: {
        id: randomUUID(),
        type: 'USER_PROMPT',
        semanticParts: [
          {
            type: 'file_data',
            mimeType: 'application/pdf',
            fileUri: 'gs://fake-bucket/doc.pdf',
          },
        ],
        metadata: {
          originalTokens: 300,
          currentTokens: 300,
          transformations: [],
        },
      },
      steps: [],
    };

    const state = getDummyState(false, 500, new Set());
    const result = await processor.process([ep], state);

    const parts = (result[0].trigger as UserPrompt).semanticParts;
    expect(parts[0].presentation).toBeDefined();
    expect(parts[0].presentation!.text).toContain(
      '[File Reference (application/pdf)',
    );
    expect(parts[0].presentation!.text).toContain(
      'Original URI: gs://fake-bucket/doc.pdf',
    );

    expect(fsPromises.writeFile).not.toHaveBeenCalled();
  });
});
