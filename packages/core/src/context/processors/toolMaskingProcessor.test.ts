/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { ToolMaskingProcessor } from './toolMaskingProcessor.js';
import {
  createMockEnvironment,
  createDummyState,
  createDummyToolNode,
} from '../testing/contextTestUtils.js';

describe('ToolMaskingProcessor', () => {
  it('should write large strings to disk and replace them with a masked pointer', async () => {
    const env = createMockEnvironment();
    // 1 token = 1 char for simplicity
    // Fake token calculator says new tokens are 5
    env.tokenCalculator.estimateTokensForParts = vi.fn().mockReturnValue(5);

    const processor = ToolMaskingProcessor.create(env, {
      stringLengthThresholdTokens: 10,
    });

    const state = createDummyState(false, 500);

    const toolStep = createDummyToolNode('ep1', 50, 100, {
      observation: {
        result: 'this is a really long string that should get masked out because it exceeds 10 chars',
        metadata: 'short',
      },
    });

    const result = await processor.process({
      buffer: {} as unknown as import('../pipeline.js').ContextWorkingBuffer,
      targets: [toolStep],
      state,
      inbox: {} as any,
    });

    expect(result.length).toBe(1);
    const masked = result[0];
    
    // It should have generated a new ID because it modified it
    expect(masked.id).not.toBe(toolStep.id);

    // It should have masked the observation
    const obs = (masked as any).observation;
    expect(obs.result).toContain('<tool_output_masked>');
    expect(obs.metadata).toBe('short'); // Untouched

    // Transformation logged
  });

  it('should skip unmaskable tools', async () => {
    const env = createMockEnvironment();

    const processor = ToolMaskingProcessor.create(env, {
      stringLengthThresholdTokens: 10,
    });

    const state = createDummyState(false, 500);

    const toolStep = createDummyToolNode('ep1', 10, 10, {
      toolName: 'activate_skill',
      observation: {
        result: 'this is a really long string that normally would get masked but wont because of the tool name',
      }
    });

    const result = await processor.process({
      buffer: {} as unknown as import('../pipeline.js').ContextWorkingBuffer,
      targets: [toolStep],
      state,
      inbox: {} as any,
    });

    // Returned the exact same object reference
    expect(result[0]).toBe(toolStep);
  });
});
