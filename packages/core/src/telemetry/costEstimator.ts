/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pricing tier for a specific model (cost per 1M tokens).
 */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion: number;
}

/**
 * Cost breakdown for a single model.
 */
export interface ModelCostBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  inputCost: number;
  outputCost: number;
  cachedSavings: number;
  totalCost: number;
}

/**
 * Overall cost summary.
 */
export interface CostSummary {
  totalCost: number;
  totalSavingsFromCache: number;
  modelBreakdowns: ModelCostBreakdown[];
  cheapestModel: string | null;
  mostExpensiveModel: string | null;
  recommendation: string | null;
}

// Gemini model pricing (per 1M tokens, USD)
const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'gemini-2.0-flash': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
    cachedInputPerMillion: 0.025,
  },
  'gemini-2.5-flash': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cachedInputPerMillion: 0.0375,
  },
  'gemini-2.5-pro': {
    inputPerMillion: 1.25,
    outputPerMillion: 10.0,
    cachedInputPerMillion: 0.3125,
  },
  'gemini-2.0-pro': {
    inputPerMillion: 1.0,
    outputPerMillion: 4.0,
    cachedInputPerMillion: 0.25,
  },
};

/**
 * Estimates token costs for Gemini API usage based on model-specific
 * pricing tiers. Tracks per-model input/output/cached tokens and
 * computes cost breakdowns with cache savings and model-switch recommendations.
 */
export class CostEstimator {
  private pricing: Record<string, ModelPricing>;
  private tokenUsage: Map<
    string,
    { input: number; output: number; cached: number }
  > = new Map();

  constructor(customPricing?: Record<string, ModelPricing>) {
    this.pricing = { ...DEFAULT_PRICING, ...customPricing };
  }

  /**
   * Records token usage for a model.
   */
  recordUsage(
    model: string,
    tokens: { input: number; output: number; cached?: number },
  ): void {
    const existing = this.tokenUsage.get(model) || {
      input: 0,
      output: 0,
      cached: 0,
    };
    existing.input += tokens.input;
    existing.output += tokens.output;
    existing.cached += tokens.cached || 0;
    this.tokenUsage.set(model, existing);
  }

  /**
   * Gets pricing for a model, falling back to a default if not found.
   */
  getPricing(model: string): ModelPricing {
    // Try exact match first, then prefix match
    if (this.pricing[model]) return this.pricing[model];
    for (const [key, pricing] of Object.entries(this.pricing)) {
      if (model.startsWith(key)) return pricing;
    }
    // Default fallback
    return {
      inputPerMillion: 0.5,
      outputPerMillion: 1.5,
      cachedInputPerMillion: 0.125,
    };
  }

  /**
   * Computes cost for a given token count at a specific rate.
   */
  private computeCost(tokens: number, perMillion: number): number {
    return (tokens / 1_000_000) * perMillion;
  }

  /**
   * Builds a complete cost summary across all tracked models.
   */
  getSummary(): CostSummary {
    const breakdowns: ModelCostBreakdown[] = [];
    let totalCost = 0;
    let totalSavings = 0;

    for (const [model, usage] of this.tokenUsage.entries()) {
      const pricing = this.getPricing(model);

      const nonCachedInput = Math.max(0, usage.input - usage.cached);
      const inputCost =
        this.computeCost(nonCachedInput, pricing.inputPerMillion) +
        this.computeCost(usage.cached, pricing.cachedInputPerMillion);
      const outputCost = this.computeCost(
        usage.output,
        pricing.outputPerMillion,
      );
      const fullInputCost = this.computeCost(
        usage.input,
        pricing.inputPerMillion,
      );
      const cachedSavings = fullInputCost - inputCost;

      const modelTotal = inputCost + outputCost;
      totalCost += modelTotal;
      totalSavings += cachedSavings;

      breakdowns.push({
        model,
        inputTokens: usage.input,
        outputTokens: usage.output,
        cachedTokens: usage.cached,
        inputCost,
        outputCost,
        cachedSavings,
        totalCost: modelTotal,
      });
    }

    // Sort by cost descending
    breakdowns.sort((a, b) => b.totalCost - a.totalCost);

    const cheapestModel =
      breakdowns.length > 0 ? breakdowns[breakdowns.length - 1].model : null;
    const mostExpensiveModel =
      breakdowns.length > 0 ? breakdowns[0].model : null;

    // Generate recommendation
    let recommendation: string | null = null;
    if (
      breakdowns.length > 1 &&
      mostExpensiveModel &&
      cheapestModel &&
      mostExpensiveModel !== cheapestModel
    ) {
      const expensive = breakdowns[0];
      const cheap = breakdowns[breakdowns.length - 1];
      if (expensive.totalCost > cheap.totalCost * 3) {
        recommendation = `Consider using ${cheap.model} instead of ${expensive.model} for cost savings — ${expensive.model} costs ${(expensive.totalCost / Math.max(cheap.totalCost, 0.0001)).toFixed(1)}x more.`;
      }
    }

    return {
      totalCost,
      totalSavingsFromCache: totalSavings,
      modelBreakdowns: breakdowns,
      cheapestModel,
      mostExpensiveModel,
      recommendation,
    };
  }

  /**
   * Resets tracked token usage.
   */
  reset(): void {
    this.tokenUsage.clear();
  }
}
