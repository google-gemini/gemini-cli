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
      role: 'model',
      payload: {
        functionResponse: {
          name: 'dummy_tool',
          id: 'dummy_id',
          response: {
            result: longString,
            metadata: 'short', // 5 chars, will not be masked
          },
        },
      },
    });

    const result = await processor.process(createMockProcessArgs([toolStep]));

    expect(result.length).toBe(1);
    const masked = result[0] as ToolExecution;

    // It should have generated a new ID because it modified it
    expect(masked.id).not.toBe(toolStep.id);

    // It should have masked the observation
    const obs = masked.payload.functionResponse?.response as {
      result: string;
      metadata: string;
    };
    expect(obs.result).toContain('<tool_output_masked>');
    expect(obs.metadata).toBe('short'); // Untouched
  });

  it('should skip unmaskable tools', async () => {
    const env = createMockEnvironment();

    const processor = createToolMaskingProcessor('ToolMaskingProcessor', env, {
      stringLengthThresholdTokens: 10,
    });

    const toolStep = createDummyToolNode('ep1', 10, 10, {
      payload: {
        functionCall: {
          name: 'activate_skill',
          id: 'dummy_id',
          args: {
            result:
              'this is a really long string that normally would get masked but wont because of the tool name',
          },
        },
      },
    });

    const result = await processor.process(createMockProcessArgs([toolStep]));

    // Returned the exact same object reference
    expect(result[0]).toBe(toolStep);
  });
  it('should strictly preserve the original intent args when only the observation is masked', async () => {
    const env = createMockEnvironment();

    const processor = createToolMaskingProcessor('ToolMaskingProcessor', env, {
      stringLengthThresholdTokens: 10,
    });

    const originalIntent = { command: 'ls -R', dir: '/tmp' };
    const longString = 'A'.repeat(500);

    const toolStep = createDummyToolNode('ep1', 50, 500, {
      payload: {
        functionCall: {
          name: 'ls',
          id: 'call_123',
          args: originalIntent,
        },
      },
    });

    // We also need a response node if we want to test "observation is masked"
    // Wait, the test says "strictly preserve the original intent args when only the observation is masked"
    // But ToolMaskingProcessor processes nodes individually now.
    // If we have a ToolExecution node with a functionCall, it masks the args.
    // If we have a ToolExecution node with a functionResponse, it masks the response.

    const responseStep = createDummyToolNode('ep1', 50, 500, {
      payload: {
        functionResponse: {
          name: 'ls',
          id: 'call_123',
          response: {
            result: longString,
          },
        },
      },
    });

    const result = await processor.process(
      createMockProcessArgs([toolStep, responseStep]),
    );

    expect(result.length).toBe(2);
    const maskedCall = result[0] as ToolExecution;
    const maskedObs = result[1] as ToolExecution;

    // Intent was short, so it should be the same node (or at least same content)
    expect(maskedCall.payload.functionCall?.args).toEqual(originalIntent);

    // Observation was long, so it should be masked
    expect(maskedObs.id).not.toBe(responseStep.id);
    const obs = maskedObs.payload.functionResponse?.response as {
      result: string;
    };
    expect(obs.result).toContain('<tool_output_masked>');
  });
});
