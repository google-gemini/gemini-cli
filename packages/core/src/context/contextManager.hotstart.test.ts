/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createMockContextConfig,
  setupContextComponentTest,
  createMockLlmClient,
} from './testing/contextTestUtils.js';
import { stressTestProfile } from './config/profiles.js';

describe('ContextManager - Hot Start Calibration', () => {
  it('should not perform calibration if the buffer is empty', async () => {
    const mockLlm = createMockLlmClient();
    const config = createMockContextConfig(undefined, mockLlm);
    const { contextManager } = setupContextComponentTest(
      config,
      stressTestProfile,
    );

    // We can spy on the underlying mock LLM client countTokens
    const countTokensSpy = vi.spyOn(mockLlm, 'countTokens');

    // Render an empty graph
    await contextManager.renderHistory();

    expect(countTokensSpy).not.toHaveBeenCalled();
  });

  it('should perform calibration exactly once when rendering with existing nodes', async () => {
    const mockLlm = createMockLlmClient();
    const countTokensSpy = vi
      .spyOn(mockLlm, 'countTokens')
      .mockResolvedValue({ totalTokens: 42 });

    const config = createMockContextConfig(undefined, mockLlm);
    const { contextManager, chatHistory } = setupContextComponentTest(
      config,
      stressTestProfile,
    );

    // We need to access the env's eventBus inside the contextManager
    const env = Reflect.get(contextManager, 'env');
    const emitGroundTruthSpy = vi.spyOn(env.eventBus, 'emitTokenGroundTruth');

    // Add a node to make the buffer non-empty
    chatHistory.set([
      { id: 'h1', content: { role: 'user', parts: [{ text: 'Hello' }] } },
    ]);

    // First render should trigger calibration
    await contextManager.renderHistory();

    expect(countTokensSpy).toHaveBeenCalledTimes(1);
    expect(emitGroundTruthSpy).toHaveBeenCalledTimes(1);
    expect(emitGroundTruthSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actualTokens: 42,
        promptBaseUnits: 10,
      }),
    );

    // Second render should skip calibration
    await contextManager.renderHistory();
    expect(countTokensSpy).toHaveBeenCalledTimes(1);
    // emit hasn't been called again
    expect(emitGroundTruthSpy).toHaveBeenCalledTimes(1);
  });

  it('should silently swallow errors if countTokens API fails', async () => {
    const mockLlm = createMockLlmClient();
    const countTokensSpy = vi
      .spyOn(mockLlm, 'countTokens')
      .mockRejectedValue(new Error('API failure'));

    const config = createMockContextConfig(undefined, mockLlm);
    const { contextManager, chatHistory } = setupContextComponentTest(
      config,
      stressTestProfile,
    );

    // Add a node
    chatHistory.set([
      { id: 'h1', content: { role: 'user', parts: [{ text: 'Hello' }] } },
    ]);

    // Render should succeed without throwing
    const result = await contextManager.renderHistory();

    expect(result.history).toBeDefined();
    expect(countTokensSpy).toHaveBeenCalledTimes(1);
  });
});
