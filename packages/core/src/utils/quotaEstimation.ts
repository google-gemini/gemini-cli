/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, Part, PartListUnion } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';

export interface QuotaEstimate {
  inputTokens: number;
  estimatedOutputTokens: number;
  totalTokens: number;
  model: string;
  isEstimate: boolean;
}

export interface QuotaEstimationOptions {
  model: string;
  maxOutputTokens?: number;
  showDetailedBreakdown?: boolean;
}

/**
 * Estimates the quota usage for a given request before executing it.
 * This provides users with an estimate of how much quota their request might consume.
 */
export class QuotaEstimator {
  constructor(private readonly contentGenerator: ContentGenerator) {}

  /**
   * Estimates token usage for a given request.
   * @param contents - The input content to estimate tokens for
   * @param options - Configuration options for the estimation
   * @returns A promise that resolves to the quota estimate
   */
  async estimateQuotaUsage(
    contents: PartListUnion,
    options: QuotaEstimationOptions,
  ): Promise<QuotaEstimate> {
    try {
      // Count input tokens
      const { totalTokens: inputTokens } = await this.contentGenerator.countTokens({
        model: options.model,
        contents: Array.isArray(contents) ? contents : [contents],
      });

      if (inputTokens === undefined) {
        throw new Error(`Could not determine token count for model ${options.model}`);
      }

      // Estimate output tokens based on input length and model
      const estimatedOutputTokens = this.estimateOutputTokens(inputTokens, options);

      const totalTokens = inputTokens + estimatedOutputTokens;

      return {
        inputTokens,
        estimatedOutputTokens,
        totalTokens,
        model: options.model,
        isEstimate: true,
      };
    } catch (error) {
      // If we can't estimate, return a fallback estimate
      const fallbackInputTokens = this.fallbackTokenEstimate(contents);
      const fallbackOutputTokens = this.estimateOutputTokens(fallbackInputTokens, options);
      
      return {
        inputTokens: fallbackInputTokens,
        estimatedOutputTokens: fallbackOutputTokens,
        totalTokens: fallbackInputTokens + fallbackOutputTokens,
        model: options.model,
        isEstimate: true,
      };
    }
  }

  /**
   * Estimates output tokens based on input tokens and model characteristics.
   * This is a heuristic estimate and may not be accurate for all cases.
   */
  private estimateOutputTokens(
    inputTokens: number,
    options: QuotaEstimationOptions,
  ): number {
    // If maxOutputTokens is specified, use that
    if (options.maxOutputTokens) {
      return options.maxOutputTokens;
    }

    // Use model-specific heuristics for estimation
    const model = options.model.toLowerCase();
    
    // Different models have different typical output ratios
    if (model.includes('gemini-2.5-pro') || model.includes('gemini-2.5-ultra')) {
      // Pro/Ultra models tend to be more verbose and detailed
      return Math.min(Math.max(inputTokens * 1.5, 100), 8000);
    } else if (model.includes('gemini-2.5-flash')) {
      // Flash models are more concise
      return Math.min(Math.max(inputTokens * 1.2, 100), 4000);
    } else if (model.includes('gemini-1.5')) {
      // 1.5 models have moderate verbosity
      return Math.min(Math.max(inputTokens * 1.3, 100), 6000);
    } else {
      // Default fallback
      return Math.min(Math.max(inputTokens * 1.25, 100), 5000);
    }
  }

  /**
   * Fallback token estimation when the API call fails.
   * Uses character count as a rough approximation.
   */
  private fallbackTokenEstimate(contents: PartListUnion): number {
    let totalCharacters = 0;
    
    if (Array.isArray(contents)) {
      for (const content of contents) {
        if (typeof content === 'string') {
          totalCharacters += content.length;
        } else if (content && typeof content === 'object' && 'text' in content) {
          totalCharacters += (content as { text: string }).text.length;
        }
      }
    } else if (typeof contents === 'string') {
      totalCharacters = contents.length;
    } else if (contents && typeof contents === 'object' && 'text' in contents) {
      totalCharacters = (contents as { text: string }).text.length;
    }

    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(totalCharacters / 4);
  }

  /**
   * Formats the quota estimate for display to the user.
   */
  formatQuotaEstimate(
    estimate: QuotaEstimate,
    options: { showDetailedBreakdown?: boolean } = {},
  ): string {
    const { showDetailedBreakdown = false } = options;
    
    let message = `📊 Quota Estimate for ${estimate.model}:\n`;
    
    if (showDetailedBreakdown) {
      message += `   Input tokens: ${estimate.inputTokens.toLocaleString()}\n`;
      message += `   Estimated output tokens: ${estimate.estimatedOutputTokens.toLocaleString()}\n`;
      message += `   Total estimated tokens: ${estimate.totalTokens.toLocaleString()}\n`;
    } else {
      message += `   Estimated total tokens: ${estimate.totalTokens.toLocaleString()}\n`;
    }
    
    message += `\n⚠️  Note: This is an estimate only and actual usage may vary.`;
    
    return message;
  }
}
