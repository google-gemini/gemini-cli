/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { createToolMaskingProcessor } from './toolMaskingProcessor.js';
import {
  createMockProcessArgs,
  createMockEnvironment,
  createDummyToolNode,
} from '../testing/contextTestUtils.js';
import type { ToolExecution } from '../graph/types.js';

describe('ToolMaskingProcessor', () => {
  it('should write large strings to disk and replace them with a masked pointer', async () => {
    const env = createMockEnvironment();
    // env uses charsPerToken=1 natively.
    // original string lengths > stringLengthThresholdTokens (which is 10) will be masked

    const processor = createToolMaskingProcessor('ToolMaskingProcessor', env, {
      stringLengthThresholdTokens: 10,
    });

    const longString = 'A'.repeat(500); // 500 chars

    const toolStep = createDummyToolNode('ep1', 50, 500, {
      observation: {
        result: longString,
        metadata: 'short', // 5 chars, will not be masked
      },
    });

    const result = await processor.process(createMockProcessArgs([toolStep]));

    expect(result.length).toBe(1);
    const masked = result[0] as ToolExecution;

    // It should have generated a new ID because it modified it
    expect(masked.id).not.toBe(toolStep.id);

    // It should have masked the observation
    const obs = masked.observation as { result: string; metadata: string };
    expect(obs.result).toContain('<tool_output_masked>');
    expect(obs.metadata).toBe('short'); // Untouched
  });

  it('should skip unmaskable tools', async () => {
    const env = createMockEnvironment();

    const processor = createToolMaskingProcessor('ToolMaskingProcessor', env, {
      stringLengthThresholdTokens: 10,
    });

    const toolStep = createDummyToolNode('ep1', 10, 10, {
      toolName: 'activate_skill',
      observation: {
        result:
          'this is a really long string that normally would get masked but wont because of the tool name',
      },
    });

    const result = await processor.process(createMockProcessArgs([toolStep]));

    // Returned the exact same object reference
    expect(result[0]).toBe(toolStep);
  });
});
