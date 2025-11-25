/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, GenerateContentResponse } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { getResponseText } from '../utils/partUtils.js';

export interface GoalExtractionResult {
  goals: string[];
  confidence: 'high' | 'medium' | 'low' | 'none';
  error?: string;
}

export interface GoalExtractionOptions {
  maxMessages?: number;
  timeoutMs?: number;
}

/**
 * Service for extracting user goals from conversation history
 */
export class GoalExtractionService {
  /**
   * Extracts potential goals from recent conversation history
   */
  async extractGoals(
    history: Content[],
    contentGenerator: ContentGenerator,
    model: string,
    promptId: string,
    options?: GoalExtractionOptions,
  ): Promise<GoalExtractionResult> {
    const maxMessages = options?.maxMessages ?? 20;
    const timeoutMs = options?.timeoutMs ?? 10000;

    try {
      // Get recent history
      const recentHistory = history.slice(-maxMessages);

      // Create goal extraction prompt
      const prompt = this.createGoalExtractionPrompt();

      // Call model with timeout
      const responsePromise = contentGenerator.generateContent(
        {
          model,
          contents: [
            ...recentHistory,
            {
              role: 'user',
              parts: [
                {
                  text: 'Based on the conversation above, analyze the recent conversation and identify what I am currently working on.',
                },
              ],
            },
          ],
          config: {
            systemInstruction: { text: prompt },
          },
        },
        promptId,
      );

      const timeoutPromise = new Promise<GenerateContentResponse>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs),
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);

      // Parse response
      const text = getResponseText(response as GenerateContentResponse) ?? '';
      const goals = this.parseGoals(text);

      return {
        goals,
        confidence: this.determineConfidence(goals, text),
      };
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'Timeout';
      return {
        goals: [],
        confidence: 'none',
        error: isTimeout ? 'timeout' : 'extraction_failed',
      };
    }
  }

  private createGoalExtractionPrompt(): string {
    return `
You are a goal extraction assistant. Your task is to identify what the user is currently working on based on their conversation.

Analyze the conversation and identify 1-3 specific, actionable goals the user is pursuing RIGHT NOW.

Guidelines:
- Focus on CURRENT work, not past discussions or future plans
- Be specific (e.g., "Implementing OAuth authentication" not "Working on auth")
- Prioritize recent messages over older ones
- If the conversation is just exploratory with no clear goal, return empty
- Limit to 3 goals maximum, ordered by relevance

Return your response in this XML format:

<goals>
  <goal>First specific goal</goal>
  <goal>Second specific goal (if applicable)</goal>
  <goal>Third specific goal (if applicable)</goal>
</goals>

If there are NO clear current goals, return: <goals></goals>
`.trim();
  }

  private parseGoals(text: string): string[] {
    const goals: string[] = [];

    // Extract all <goal> tags
    const goalRegex = /<goal>\s*(.*?)\s*<\/goal>/gs;
    let match;

    while ((match = goalRegex.exec(text)) !== null) {
      const goal = match[1].trim();
      if (goal) {
        goals.push(goal);
      }
    }

    return goals;
  }

  private determineConfidence(
    goals: string[],
    _text: string,
  ): 'high' | 'medium' | 'low' | 'none' {
    if (goals.length === 0) {
      return 'none';
    }

    if (goals.length === 1 && goals[0].length > 30) {
      // Single, detailed goal = high confidence
      return 'high';
    }

    if (goals.length >= 2) {
      // Multiple goals = medium confidence
      return 'medium';
    }

    // Short goal = low confidence
    return 'low';
  }
}
