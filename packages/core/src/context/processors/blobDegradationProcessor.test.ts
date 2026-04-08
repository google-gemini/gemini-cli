/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { BlobDegradationProcessor } from './blobDegradationProcessor.js';
import {
  createMockEnvironment,
  createDummyState,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import type { UserPrompt, SemanticPart } from '../ir/types.js';

describe('BlobDegradationProcessor', () => {
  it('should ignore text parts and only target inline_data and file_data', async () => {
    const env = createMockEnvironment();
    // Simulate each part costing 100 tokens, but text costing 10 tokens
    env.tokenCalculator.estimateTokensForParts = vi.fn((parts: any[]) => {
       if (parts[0].text) return 10;
       return 100;
    });

    const processor = BlobDegradationProcessor.create(env, {});

    // Deficit of 50 means budget is NOT satisfied.
    const state = createDummyState(false, 50);

    const parts: SemanticPart[] = [
      { type: 'text', text: 'Hello' },
      { type: 'inline_data', mimeType: 'image/png', data: 'fake_base64_data' },
      { type: 'text', text: 'World' },
    ];

    const prompt = createDummyNode('ep1', 'USER_PROMPT', 100, {
      semanticParts: parts
    }) as UserPrompt;

    const targets = [prompt];

    const result = await processor.process({
      buffer: {} as any,
      targets,
      state,
      inbox: {} as any,
    });

    // We modified it, so the ID should change and it should have new metadata
    expect(result.length).toBe(1);
    const modifiedPrompt = result[0] as UserPrompt;
    
    // Original prompt ID was randomUUID(), new one is from idGenerator
    expect(modifiedPrompt.id).not.toBe(prompt.id);
    expect(modifiedPrompt.semanticParts.length).toBe(3);
    
    // Text parts should be untouched
    expect(modifiedPrompt.semanticParts[0]).toEqual(parts[0]);
    expect(modifiedPrompt.semanticParts[2]).toEqual(parts[2]);

    // The inline_data part should be replaced with text
    const degradedPart = modifiedPrompt.semanticParts[1];
    expect(degradedPart.type).toBe('text');
    expect((degradedPart as any).text).toContain('[Multi-Modal Blob (image/png, 0.00MB) degraded to text');

    // The transformation should be logged
    expect(modifiedPrompt.metadata.transformations.length).toBe(1);
    expect(modifiedPrompt.metadata.transformations[0].action).toBe('DEGRADED');
  });

  it('should stop degrading once the deficit is cleared', async () => {
    const env = createMockEnvironment();
    // Huge deficit requires one degradation
    const state = createDummyState(false, 90);

    env.tokenCalculator.estimateTokensForParts = vi.fn((parts: any[]) => {
       if (parts[0].text) return 10;
       return 100; // saving 90 tokens per degradation
    });

    const processor = BlobDegradationProcessor.create(env, {});

    const prompt = createDummyNode('ep1', 'USER_PROMPT', 100, {
      semanticParts: [
        { type: 'file_data', mimeType: 'video/mp4', fileUri: 'gs://test1' },
        { type: 'file_data', mimeType: 'video/mp4', fileUri: 'gs://test2' },
      ]
    }) as UserPrompt;

    const targets = [prompt];

    const result = await processor.process({
      buffer: {} as any,
      targets,
      state,
      inbox: {} as any,
    });

    const modifiedPrompt = result[0] as UserPrompt;
    expect(modifiedPrompt.semanticParts.length).toBe(2);
    
    // First part was degraded
    expect(modifiedPrompt.semanticParts[0].type).toBe('text');
    // Second part was untouched because deficit hit 0
    expect(modifiedPrompt.semanticParts[1].type).toBe('file_data');
  });

  it('should return exactly the targets array if budget is already satisfied', async () => {
    const env = createMockEnvironment();
    const state = createDummyState(true, 0); // Budget satisfied!

    const processor = BlobDegradationProcessor.create(env, {});
    const prompt = createDummyNode('ep1', 'USER_PROMPT', 100, {
      semanticParts: [
        { type: 'inline_data', mimeType: 'image/png', data: 'abc' },
      ]
    }) as UserPrompt;

    const targets = [prompt];

    const result = await processor.process({
      buffer: {} as any,
      targets,
      state,
      inbox: {} as any,
    });

    // Should return the exact array ref
    expect(result).toBe(targets);
  });
});
