/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';

const TOPIC_DETECTION_SYSTEM_PROMPT = `You are an expert at analyzing conversation topics.
Your task is to determine if the "Current Query" represents a significant shift in topic from the "Last Query".

Rules:
1. If the "Current Query" is a follow-up, clarification, or related to the same subject as the "Last Query", it is NOT a topic change.
2. If the "Current Query" introduces a completely different subject, task, or domain that has no relation to the "Last Query", it IS a topic change.
3. If you are unsure, but the topics seem unrelated, favor flagging it as not a topic change.

Output format:
You must respond with a JSON object:
{
  "topic_changed": boolean,
  "reasoning": "brief explanation"
}
`;

const TOPIC_DETECTION_SCHEMA = {
  type: 'object',
  properties: {
    topic_changed: {
      type: 'boolean',
      description: 'Whether the topic has shifted significantly.',
    },
    reasoning: {
      type: 'string',
      description: 'Brief explanation for the decision.',
    },
  },
  required: ['topic_changed', 'reasoning'],
};

export class TopicDetectionService {
  constructor(private readonly config: Config) {}

  async isTopicChanged(
    lastQuery: string,
    currentQuery: string,
    promptId: string,
    abortSignal?: AbortSignal,
  ): Promise<{ topic_changed: boolean; reasoning: string }> {
    if (!lastQuery || !currentQuery) {
      return { topic_changed: false, reasoning: 'Empty query' };
    }

    try {
      const prompt = `Last Query: "${lastQuery}"\n\nCurrent Query: "${currentQuery}"`;

      debugLogger.log(
        `TopicDetectionService: Checking topic change. lastQuery: "${lastQuery}", currentQuery: "${currentQuery}"`,
      );

      const result = await this.config.getBaseLlmClient().generateJson({
        modelConfigKey: { model: 'topic-detection' },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        schema: TOPIC_DETECTION_SCHEMA,
        systemInstruction: TOPIC_DETECTION_SYSTEM_PROMPT,
        abortSignal: abortSignal!,
        promptId,
        maxAttempts: 2,
      });

      if (result && typeof result['topic_changed'] === 'boolean') {
        const topic_changed = result['topic_changed'];
        const reasoning = (result['reasoning'] as string) || '';
        debugLogger.log(
          `Topic detection result: ${topic_changed} (${reasoning})`,
        );
        return { topic_changed, reasoning };
      }
    } catch (error) {
      debugLogger.warn(`Error in TopicDetectionService: ${error}`);
      return { topic_changed: false, reasoning: `Error: ${error}` };
    }

    return { topic_changed: false, reasoning: 'Unexpected result format' };
  }
}
