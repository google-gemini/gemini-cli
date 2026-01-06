/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import { isGemini2Model, isPreviewModel } from '../config/models.js';
import { ThinkingLevel } from '@google/genai';

export enum ComplexityLevel {
  SIMPLE = 1,
  MODERATE = 2,
  HIGH = 3,
  EXTREME = 4,
}

export const BUDGET_MAPPING_V2: Record<ComplexityLevel, number> = {
  [ComplexityLevel.SIMPLE]: 1024,
  [ComplexityLevel.MODERATE]: 4096,
  [ComplexityLevel.HIGH]: 16384,
  [ComplexityLevel.EXTREME]: 32768,
};

export const LEVEL_MAPPING_V3: Record<ComplexityLevel, ThinkingLevel> = {
  [ComplexityLevel.SIMPLE]: ThinkingLevel.LOW,
  [ComplexityLevel.MODERATE]: ThinkingLevel.LOW,
  [ComplexityLevel.HIGH]: ThinkingLevel.HIGH,
  [ComplexityLevel.EXTREME]: ThinkingLevel.HIGH,
};

export interface AdaptiveBudgetResult {
  complexity: ComplexityLevel;
  thinkingBudget?: number;
  thinkingLevel?: ThinkingLevel;
  strategyNote?: string;
}

export class AdaptiveBudgetService {
  constructor(private config: Config) {}

  /**
   * Analyzes the user prompt and determines the optimal thinking configuration.
   *
   * Note on future scaling (per arXiv:2512.19585):
   * At Complexity 4 (Extreme), we should consider:
   * 1. Best-of-N: Generate multiple solutions.
   * 2. LLM-as-a-Judge: Use a strong model to evaluate candidates.
   * 3. Compiler Verification: Check code correctness via environment tools.
   */
  async determineAdaptiveConfig(
    userPrompt: string,
    model: string,
  ): Promise<AdaptiveBudgetResult | undefined> {
    const { classifierModel } = this.config.getAdaptiveThinkingConfig();

    try {
      const llm = this.config.getBaseLlmClient();
      debugLogger.debug(
        `AdaptiveBudgetService: Classifying prompt complexity using ${classifierModel}...`,
      );
      const systemPrompt = `You are a complexity classifier for a coding assistant. 
Analyze the user's request and determine the complexity of the task.
Output ONLY a single integer from 1 to 4 based on the following scale:

1 (Simple): Quick fixes, syntax questions, simple explanations, greetings.
2 (Moderate): Function-level logic, writing small scripts, standard debugging.
3 (High): Module-level refactoring, complex feature implementation, multi-file changes.
4 (Extreme): Architecture design, deep root-cause analysis of obscure bugs, large-scale migrations.

Request: ${userPrompt}
Complexity Level:`;

      const response = await llm.generateContent({
        modelConfigKey: { model: classifierModel },
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        promptId: 'adaptive-budget-classifier',
        abortSignal: new AbortController().signal,
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        debugLogger.debug(
          'AdaptiveBudgetService: No response from classifier.',
        );
        return undefined;
      }

      const level = parseInt(text, 10) as ComplexityLevel;
      if (isNaN(level) || level < 1 || level > 4) {
        debugLogger.debug(
          `AdaptiveBudgetService: Invalid complexity level returned: ${text}`,
        );
        return undefined;
      }

      const result: AdaptiveBudgetResult = { complexity: level };

      // Determine mapping based on model version
      // Gemini 3 uses ThinkingLevel, Gemini 2.x uses thinkingBudget
      if (isPreviewModel(model)) {
        result.thinkingLevel = LEVEL_MAPPING_V3[level] ?? ThinkingLevel.HIGH;
      } else if (isGemini2Model(model)) {
        result.thinkingBudget = BUDGET_MAPPING_V2[level];
      }

      if (level === ComplexityLevel.EXTREME) {
        result.strategyNote =
          'EXTREME complexity detected. Future implementations should use Best-of-N + Verification.';
      }

      debugLogger.debug(
        `AdaptiveBudgetService: Complexity ${level} -> Thinking Param: ${result.thinkingLevel || result.thinkingBudget}`,
      );
      return result;
    } catch (error) {
      debugLogger.error(
        'AdaptiveBudgetService: Error classifying complexity',
        error,
      );
      return undefined;
    }
  }

  getThinkingBudgetV2(level: ComplexityLevel): number {
    return BUDGET_MAPPING_V2[level];
  }

  getThinkingLevelV3(level: ComplexityLevel): ThinkingLevel {
    return LEVEL_MAPPING_V3[level] ?? ThinkingLevel.HIGH;
  }
}
