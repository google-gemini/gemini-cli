/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IrMapper } from './ir/mapper.js';
import {
  createSyntheticHistory,
  createMockContextConfig,
  setupContextComponentTest,
} from './testing/contextTestUtils.js';

describe('ContextManager Sync Pressure Barrier Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should instantly truncate history when maxTokens is exceeded using truncate strategy', async () => {
    // 1. Setup
    const config = createMockContextConfig();
    const { chatHistory, contextManager } = setupContextComponentTest(config);

    // 2. Add System Prompt (Episode 0 - Protected)
    chatHistory.set([{ role: 'user', parts: [{ text: 'System prompt' }] }, { role: 'model', parts: [{ text: 'Understood.' }] }]);

    // 3. Add massive history that blows past the 150k maxTokens limit
    // 20 turns * 10,000 tokens/turn = ~200,000 tokens
    const massiveHistory = createSyntheticHistory(20, 35000);
    chatHistory.set([...chatHistory.get(), ...massiveHistory]);

    // 4. Add the Latest Turn (Protected)
    chatHistory.set([...chatHistory.get(), { role: 'user', parts: [{ text: 'Final question.' }] }, { role: 'model', parts: [{ text: 'Final answer.' }] }]);

    const rawHistoryLength = chatHistory.get().length;
    IrMapper.setConfig({ charsPerToken: 1 });

    // 5. Project History (Triggers Sync Barrier)
    const projection = await contextManager.projectCompressedHistory();

    // 6. Assertions
    // The barrier should have dropped several older episodes to get under 150k.
    
    expect(projection.length).toBeLessThan(rawHistoryLength);

    

    // Verify Episode 0 (System) is perfectly preserved at the front
    
    expect(projection[0].role).toBe('user');
    expect(projection[0].parts![0].text).toBe('System prompt');

    // Verify the latest turn is perfectly preserved at the back
    const lastUser = projection[projection.length - 2];
    const lastModel = projection[projection.length - 1];

    expect(lastUser.role).toBe('user');
    expect(lastUser.parts![0].text).toBe('Final question.');
    
    expect(lastModel.role).toBe('model');
    expect(lastModel.parts![0].text).toBe('Final answer.');
  });
});
