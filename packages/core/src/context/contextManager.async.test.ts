import { IrMapper } from './ir/mapper.js';
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  createMockContextConfig,
  setupContextComponentTest,
} from './testing/contextTestUtils.js';

describe('ContextManager Barrier Tests', () => {
  it('Soft Barrier (retainedTokens): should inject ready variants and shrink projection', async () => {
    const config = createMockContextConfig();
    const { chatHistory, contextManager } = setupContextComponentTest(config);

    // 1. Shrink limits: 1 char = 1 token. RetainedTokens = 10. MaxTokens = 100.
    IrMapper.setConfig({ charsPerToken: 1 });

    contextManager['sidecar'].budget.retainedTokens = 5;
    contextManager['sidecar'].budget.maxTokens = 100;

    // 2. Build tiny history: 5 turns (10 messages). 2 tokens per turn.
    const tinyHistory = [];
    for (let i = 0; i < 5; i++) {
      tinyHistory.push({ role: 'user', parts: [{ text: `U${i}` }] });
      tinyHistory.push({ role: 'model', parts: [{ text: `M${i}` }] });
    }

    // Set history directly to avoid event races
    await chatHistory.set(tinyHistory);

    // 3. Pre-verify baseline length.
    const baseline = await contextManager.projectCompressedHistory();
    expect(baseline.length).toBe(10);

    // 4. Emit a fake snapshot covering the first 3 pairs (6 messages)
    const targetEp = contextManager['pristineEpisodes'][2];
    const replacedIds = contextManager['pristineEpisodes']
      .slice(0, 3)
      .map((ep) => ep.id);

    contextManager['eventBus'].emitVariantReady({
      targetId: targetEp.id,
      variantId: 'snapshot',
      variant: {
        status: 'ready',
        type: 'snapshot',
        replacedEpisodeIds: replacedIds,
        episode: {
          id: 'snapshot-ep',
          timestamp: Date.now(),
          trigger: {
            id: 't1',
            type: 'USER_PROMPT',
            semanticParts: [],
            metadata: {
              originalTokens: 0,
              currentTokens: 0,
              transformations: [],
            },
          },
          yield: {
            id: 'y1',
            type: 'AGENT_YIELD',
            text: '<SNAP>',
            metadata: {
              originalTokens: 5,
              currentTokens: 5,
              transformations: [],
            },
          },
          steps: [],
        },
      },
    });

    // 5. Verify Projection shrinks: 6 original messages replaced by 1 snapshot episode (1 text part) -> length 5.
    const projection = await contextManager.projectCompressedHistory();
    expect(projection.length).toBe(5);
    // console.dir(projection, {depth: null});
    // projection[0] should be the snapshot yield
    expect(projection[0].parts![0].text).toBe('<SNAP>');
  });

  it('Hard Barrier (maxTokens): should ruthlessly truncate unprotected episodes', async () => {
    const config = createMockContextConfig();
    const { chatHistory, contextManager } = setupContextComponentTest(config);

    // 1. Shrink limits: maxTokens = 15.
    IrMapper.setConfig({ charsPerToken: 1 });
    contextManager['sidecar'].budget.maxTokens = 15;

    // 2. Build history: 2 turns. Total = 24 tokens.
    const history = [
      { role: 'user', parts: [{ text: 'U0' }] },
      { role: 'model', parts: [{ text: 'M0_LARGE!!' }] },
      { role: 'user', parts: [{ text: 'U1' }] },
      { role: 'model', parts: [{ text: 'M1_LARGE!!' }] },
    ];
    await chatHistory.set(history);

    const projection = await contextManager.projectCompressedHistory();

    // Because Turn 0 is architecturally protected (system prompt/initialization), it SURVIVES!
    // Turn 1 is dropped to satisfy the maxTokens constraint.
    expect(projection.length).toBe(2);
    expect(projection[0].parts![0].text).toBe('U0');
    expect(projection[1].parts![0].text).toBe('M0_LARGE!!');
  });
});
