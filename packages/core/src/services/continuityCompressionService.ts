/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import { LlmRole } from '../telemetry/llmRole.js';
import { getResponseText } from '../utils/partUtils.js';

/**
 * ContinuityCompressionService is a specialized summarizer for the "Mythical Continuous Session".
 * 
 * Unlike the standard compression service which attempts to summarize the entire conversation,
 * this service prioritizes specific `<state_checkpoint>` blocks (Continuity Anchors) 
 * provided by the agent. It ensures that critical intent and progress are preserved 
 * with high fidelity while discarding "noisy" technical details (like large file reads) 
 * that are no longer needed.
 */
export class ContinuityCompressionService {
  constructor(
    private readonly llmClient: BaseLlmClient,
  ) {}

  /**
   * Generates a high-fidelity snapshot of the conversation state.
   * It specifically looks for the most recent checkpoint and uses it as the anchor.
   */
  async generateSnapshot(history: Content[], model: string, promptId: string): Promise<string> {
    const prompt = `
You are a context compression engine for a long-running software engineering session.
Your goal is to produce a dense, high-fidelity <state_snapshot> that will replace the current history.

CRITICAL INSTRUCTIONS:
1. Identify the most recent <state_checkpoint> in the history. This is the ground truth of the agent's progress.
2. Incorporate any critical new information found *after* the last checkpoint.
3. Remove all redundant tool outputs, file contents, and intermediate research steps.
4. Output ONLY the new <state_snapshot> block.

Current History to compress:
${JSON.stringify(history)}
    `.trim();

    const result = await this.llmClient.generateContent({
      modelConfigKey: { model },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      promptId,
      role: LlmRole.UTILITY_COMPRESSOR,
      abortSignal: new AbortController().signal
    });

    return getResponseText(result)?.trim() ?? '';
  }
}
