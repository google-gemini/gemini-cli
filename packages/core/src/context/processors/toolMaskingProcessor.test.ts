/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolMaskingProcessor } from './toolMaskingProcessor.js';
import type { Config } from '../../config/config.js';
import type { Episode, ToolExecution } from '../ir/types.js';
import type { ContextAccountingState } from '../pipeline.js';
import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';

vi.mock('node:fs/promises');

describe('ToolMaskingProcessor', () => {
  let mockConfig: Config;
  let processor: ToolMaskingProcessor;

  beforeEach(() => {
    vi.resetAllMocks();
    mockConfig = {
      getContextManagementConfig: vi.fn().mockReturnValue({
        strategies: {
          toolMasking: { stringLengthThresholdTokens: 100 },
        },
      }),
      storage: { getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini') },
      getSessionId: vi.fn().mockReturnValue('test-session'),
    } as unknown as Config;

    processor = new ToolMaskingProcessor(mockConfig);
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

  const createDummyEpisode = (
    id: string,
    intent: Record<string, unknown>,
    observation: Record<string, unknown>,
  ): Episode => ({
    id,
    timestamp: Date.now(),
    trigger: {
      id: randomUUID(),
      type: 'SYSTEM_EVENT',
      name: 'test',
      payload: {},
      metadata: { originalTokens: 10, currentTokens: 10, transformations: [] },
    },
    steps: [
      {
        id: randomUUID(),
        type: 'TOOL_EXECUTION',
        toolName: 'test_tool',
        intent,
        observation,
        tokens: { intent: 500, observation: 500 }, // Claim they are big enough to be masked
        metadata: {
          originalTokens: 1000,
          currentTokens: 1000,
          transformations: [],
        },
      },
    ],
  });

  it('bypasses processing if budget is satisfied', async () => {
    const episodes = [
      createDummyEpisode('1', { arg: 'short' }, { out: 'short' }),
    ];
    const state = getDummyState(true);

    const result = await processor.process(episodes, state);

    expect(result).toStrictEqual(episodes);
    expect((result[0].steps[0] as ToolExecution).presentation).toBeUndefined();
  });

  it('deep masks massive string intents and observations', async () => {
    // We need strings > limitChars (100 tokens * 4 chars = 400 chars)
    const massiveIntentString = 'I'.repeat(500);
    const massiveObsString = 'O'.repeat(500);

    const intentPayload = { args: { nested: [massiveIntentString, 'short'] } };
    const obsPayload = { result: massiveObsString, error: null };

    const episodes = [createDummyEpisode('ep-1', intentPayload, obsPayload)];
    const state = getDummyState(false, 1000, new Set()); // Huge deficit

    const result = await processor.process(episodes, state);

    const toolStep = result[0].steps[0] as ToolExecution;

    expect(toolStep.presentation).toBeDefined();

    // Check intent was deep masked
    const maskedIntent = toolStep.presentation!.intent as Record<
      string,
      unknown
    >;
    expect((maskedIntent['args'] as { nested: string }).nested[0]).toContain(
      '<tool_output_masked>',
    );
    expect((maskedIntent['args'] as { nested: string }).nested[1]).toBe(
      'short',
    ); // Unchanged

    // Check observation was deep masked
    const maskedObs = toolStep.presentation!.observation as Record<
      string,
      unknown
    >;
    expect((maskedObs as { result: string }).result).toContain(
      '<tool_output_masked>',
    );
    expect((maskedObs as { error: string }).error).toBeNull();

    // Check disk writes occurred
    expect(fsPromises.writeFile).toHaveBeenCalledTimes(2);
  });
});
