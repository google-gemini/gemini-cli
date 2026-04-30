/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { createBlobDegradationProcessor } from './blobDegradationProcessor.js';
import {
  createMockProcessArgs,
  createMockEnvironment,
  createDummyNode,
} from '../testing/contextTestUtils.js';
import { type ConcreteNode, NodeType } from '../graph/types.js';

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

    const node1 = createDummyNode('ep1', NodeType.USER_PROMPT, 10, {
      payload: { text: 'Hello' },
    });
    const node2 = createDummyNode('ep1', NodeType.USER_PROMPT, 100, {
      payload: { inlineData: { mimeType: 'image/png', data: fakeData } },
    });
    const node3 = createDummyNode('ep1', NodeType.USER_PROMPT, 10, {
      payload: { text: 'World' },
    });

    const targets = [node1, node2, node3];

    const result = await processor.process(createMockProcessArgs(targets));

    expect(result.length).toBe(3);

    // Text nodes should be untouched
    expect(result[0]).toBe(node1);
    expect(result[2]).toBe(node3);

    // The inline_data node should be replaced with text
    const degradedNode = result[1];
    expect(degradedNode.id).not.toBe(node2.id);
    expect(degradedNode.replacesId).toBe(node2.id);
    expect(degradedNode.payload.text).toContain(
      '[Multi-Modal Blob (image/png, 0.00MB) degraded to text',
    );
  });

  it('should degrade all blobs unconditionally', async () => {
    const env = createMockEnvironment();

    const processor = createBlobDegradationProcessor(
      'BlobDegradationProcessor',
      env,
    );

    const node1 = createDummyNode('ep1', NodeType.USER_PROMPT, 100, {
      payload: {
        fileData: { mimeType: 'video/mp4', fileUri: 'gs://test1' },
      },
    });
    const node2 = createDummyNode('ep1', NodeType.USER_PROMPT, 100, {
      payload: {
        fileData: { mimeType: 'video/mp4', fileUri: 'gs://test2' },
      },
    });

    const targets = [node1, node2];

    const result = await processor.process(createMockProcessArgs(targets));

    expect(result.length).toBe(2);

    // Both nodes should be degraded
    expect(result[0].payload.text).toContain('degraded to text');
    expect(result[1].payload.text).toContain('degraded to text');
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
