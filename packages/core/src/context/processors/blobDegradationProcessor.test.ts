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
import type { ContextEnvironment } from '../sidecar/environment.js';
import { InMemoryFileSystem } from '../system/InMemoryFileSystem.js';

describe('BlobDegradationProcessor', () => {
  let processor: BlobDegradationProcessor;
  let env: ContextEnvironment;
  let fileSystem: InMemoryFileSystem;

  beforeEach(() => {
    vi.resetAllMocks();
    env = createMockEnvironment();
    fileSystem = env.fileSystem as InMemoryFileSystem;
    processor = new BlobDegradationProcessor(env);
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

    // Verify it was written to fake FS
    expect(fileSystem.getFiles().size).toBeGreaterThan(0);
    const files = Array.from(fileSystem.getFiles().keys());
    expect(files[0]).toContain('.gemini/tool-outputs/degraded-blobs/session-mock-session/blob_');
    
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

    expect(fileSystem.getFiles().size).toBe(0);
  });
});
