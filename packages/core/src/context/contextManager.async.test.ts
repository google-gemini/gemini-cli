/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSyntheticHistory,
  createMockContextConfig,
  setupContextComponentTest,
} from './testing/contextTestUtils.js';

describe('ContextManager Concurrency Component Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should asynchronously compress history when retainedTokens is crossed, without blocking projection', async () => {
    // 1. Setup with a delayed LLM client to simulate async work
    let resolveLlm: (val: any) => void;
    const llmPromise = new Promise((res) => {
      resolveLlm = res;
    });

    const llmClientOverride = {
      generateContent: vi.fn().mockImplementation(() => llmPromise),
    };

    const config = createMockContextConfig({}, llmClientOverride);
    const { chatHistory, contextManager } = setupContextComponentTest(config);

    // 2. Add System Prompt (Episode 0 - Protected)
    chatHistory.push({ role: 'user', parts: [{ text: 'System prompt' }] });
    chatHistory.push({ role: 'model', parts: [{ text: 'Understood.' }] });

    // 3. Add heavy history that crosses the 65k retained floor but stays under 150k max.
    // 10 turns * 8000 tokens/turn = 80,000 tokens (approx)
    const heavyHistory = createSyntheticHistory(10, 4000);
    for (const msg of heavyHistory) {
      chatHistory.push(msg);
    }

    // 4. Verify Immediate Projection (The async worker is stuck waiting for the LLM)
    // The projection should NOT block. It should return the full history because we are under maxTokens.
    const earlyProjection = await contextManager.projectCompressedHistory();
    expect(earlyProjection.length).toBe(chatHistory.get().length);

    // 5. Unblock the LLM and allow async events to flush
    resolveLlm!({
      text: '<mocked_snapshot>Synthesized old episodes</mocked_snapshot>',
    });
    
    // We need to flush the microtask queue so the Promise resolves and the EventBus ticks
    await vi.runAllTimersAsync();

    // 6. Verify Post-Compression Projection
    // The WorkingBufferView should now automatically inject the SnapshotVariant, shrinking the array.
    const lateProjection = await contextManager.projectCompressedHistory();
    expect(lateProjection.length).toBeLessThan(earlyProjection.length);

    // Verify the snapshot text actually made it into the stream
    const hasSnapshotText = lateProjection.some(
      (msg) =>
        msg.role === 'model' &&
        msg.parts!.some(
          (p) =>
            p.text && p.text.includes('<mocked_snapshot>Synthesized old episodes</mocked_snapshot>'),
        ),
    );
    expect(hasSnapshotText).toBe(true);
  });

  it('should handle the Race Condition: User pushing messages while a background snapshot is computing', async () => {
    let resolveLlm: (val: any) => void;
    const llmPromise = new Promise((res) => {
      resolveLlm = res;
    });

    const llmClientOverride = {
      generateContent: vi.fn().mockImplementation(() => llmPromise),
    };

    const config = createMockContextConfig({}, llmClientOverride);
    const { chatHistory, contextManager } = setupContextComponentTest(config);

    chatHistory.push({ role: 'user', parts: [{ text: 'System prompt' }] });
    chatHistory.push({ role: 'model', parts: [{ text: 'Understood.' }] });

    // Push 80k tokens to trigger compression of older nodes
    const heavyHistory = createSyntheticHistory(10, 4000);
    for (const msg of heavyHistory) {
      chatHistory.push(msg);
    }

    // At this exact moment, the StateSnapshotWorker has grabbed the oldest episodes
    // and is waiting for `llmPromise`.

    // THE RACE: The user types two more messages very quickly BEFORE the LLM returns.
    chatHistory.push({ role: 'user', parts: [{ text: 'Oh, one more thing!' }] });
    chatHistory.push({ role: 'model', parts: [{ text: 'I am listening.' }] });

    // Unblock the LLM
    resolveLlm!({ text: 'Dense Snapshot Data' });
    await vi.runAllTimersAsync();

    // Verify
    const projection = await contextManager.projectCompressedHistory();
    
    // The snapshot should be present (replacing old history)
    const hasSnapshot = projection.some((msg) =>
      msg.parts!.some((p) => p.text?.includes('Dense Snapshot Data'))
    );
    expect(hasSnapshot).toBe(true);

    // CRITICAL: The new messages typed during the race must ALSO be present and unmodified at the end of the array.
    const lastUserMsg = projection[projection.length - 2];
    const lastModelMsg = projection[projection.length - 1];
    
    expect(lastUserMsg.role).toBe('user');
    expect(lastUserMsg.parts![0].text).toBe('Oh, one more thing!');
    
    expect(lastModelMsg.role).toBe('model');
    expect(lastModelMsg.parts![0].text).toBe('I am listening.');
  });
});
