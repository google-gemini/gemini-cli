/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ConcreteNode } from '../graph/types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { LlmRole } from '../../telemetry/llmRole.js';

export class SnapshotGenerator {
  constructor(private readonly env: ContextEnvironment) {}

  async synthesizeSnapshot(
    nodes: readonly ConcreteNode[],
    systemInstruction?: string,
  ): Promise<string> {
    const systemPrompt =
      systemInstruction ??
      `You are an expert Context Memory Manager. You will be provided with a raw transcript of older conversation turns between a user and an AI assistant.
Your task is to synthesize these turns into a single, dense, factual snapshot that preserves all critical context, preferences, active tasks, and factual knowledge, but discards conversational filler, pleasantries, and redundant back-and-forth iterations.

Output ONLY the raw factual snapshot, formatted compactly. Do not include markdown wrappers, prefixes like "Here is the snapshot", or conversational elements.`;

    let userPromptText = 'TRANSCRIPT TO SNAPSHOT:\n\n';
    for (const node of nodes) {
      const payload = node.payload;
      let nodeContent = '';
      if (payload.text) {
        nodeContent = payload.text;
      } else if (payload.functionCall) {
        nodeContent = `CALL: ${payload.functionCall.name}(${JSON.stringify(payload.functionCall.args)})`;
      } else if (payload.functionResponse) {
        nodeContent = `RESPONSE: ${JSON.stringify(payload.functionResponse.response)}`;
      }

      userPromptText += `[${node.type}]: ${nodeContent}\n`;
    }

    const response = await this.env.llmClient.generateContent({
      role: LlmRole.UTILITY_STATE_SNAPSHOT_PROCESSOR,
      modelConfigKey: { model: 'gemini-3-flash-base' },
      contents: [{ role: 'user', parts: [{ text: userPromptText }] }],
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      promptId: this.env.promptId,
      abortSignal: new AbortController().signal,
    });

    const candidate = response.candidates?.[0];
    const textPart = candidate?.content?.parts?.[0];
    return textPart?.text || '';
  }
}
