/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseLlmClient } from '../core/baseLlmClient.js';
import { getResponseText } from '../utils/partUtils.js';
import { LlmRole } from '../telemetry/types.js';
import type { Summarizer } from './contextWindow.js';

function sanitizePromptInput(value: string): string {
  return value
    .replace(/\\[rn]/g, ' ')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/```/g, "'''")
    .replace(/[<>]/g, (char) => (char === '<' ? '&lt;' : '&gt;'))
    .replace(/[\x00-\x1f\x7f]/g, ''); // eslint-disable-line no-control-regex
}

/**
 * Cluster summarizer using BaseLlmClient for LLM-generated summaries.
 *
 * Single-phase summarization (no verification) since clusters are small.
 */
export class ClusterSummarizer implements Summarizer {
  private _client: BaseLlmClient;
  private _modelConfigKey: string;
  private _abortSignal?: AbortSignal;

  constructor(
    client: BaseLlmClient,
    modelConfigKey: string,
    abortSignal?: AbortSignal,
  ) {
    this._client = client;
    this._modelConfigKey = modelConfigKey;
    this._abortSignal = abortSignal;
  }

  async summarize(messages: string[]): Promise<string> {
    const fallback = messages.join('\n---\n');

    try {
      const response = await this._client.generateContent({
        modelConfigKey: { model: this._modelConfigKey },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Summarize the following conversation messages into a concise, information-dense paragraph. Preserve all specific technical details, file paths, tool results, variable names, and user constraints.\n\nMessages:\n${messages.map((m, i) => `[${i + 1}] ${sanitizePromptInput(m)}`).join('\n')}`,
              },
            ],
          },
        ],
        promptId: 'cluster-summarize',
        role: LlmRole.UTILITY_COMPRESSOR,
        abortSignal: this._abortSignal ?? new AbortController().signal,
      });

      const text = getResponseText(response)?.trim();
      if (!text) return fallback;
      return text;
    } catch (e) {
      if (this._abortSignal?.aborted) throw e;
      return fallback;
    }
  }
}
