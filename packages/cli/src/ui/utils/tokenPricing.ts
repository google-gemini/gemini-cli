/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pricing per 1M tokens (in USD) for different Gemini models.
 * Prices are approximate and may change - check https://ai.google.dev/pricing
 * TODO: Call some google API for real time pricing
 */
interface ModelPricing {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini 3 Pro (preview) - https://ai.google.dev/gemini-api/docs/pricing
  'gemini-3-pro-preview': { input: 2.0, output: 12.0 },

  // Gemini 2.5 Pro
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-pro-preview-05-06': { input: 1.25, output: 10.0 },
  'gemini-2.5-pro-preview-06-05': { input: 1.25, output: 10.0 },

  // Gemini 2.5 Flash
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.5-flash-preview-05-20': { input: 0.15, output: 0.6 },

  // Gemini 2.5 Flash-Lite
  'gemini-2.5-flash-lite': { input: 0.075, output: 0.3 },

  // Gemini 2.0 Flash
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.0-flash-preview-image-generation': { input: 0.1, output: 0.4 },
};

// Default pricing for unknown models (use Flash pricing as conservative estimate)
const DEFAULT_PRICING: ModelPricing = { input: 0.1, output: 0.4 };

/**
 * Gets the pricing for a specific model.
 */
export const getModelPricing = (model: string): ModelPricing =>
  MODEL_PRICING[model] || DEFAULT_PRICING;

/**
 * Calculates the estimated cost for token usage.
 * @param inputTokens - Number of input/prompt tokens
 * @param outputTokens - Number of output/candidate tokens
 * @param model - The model name to get pricing for
 * @returns Estimated cost in USD
 */
export const calculateCost = (
  inputTokens: number,
  outputTokens: number,
  model: string,
): number => {
  const pricing = getModelPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
};

/**
 * Calculates total cost across multiple models.
 * @param modelTokens - Record of model name to { prompt, candidates } token counts
 * @returns Total estimated cost in USD
 */
export const calculateTotalCost = (
  modelTokens: Record<string, { prompt: number; candidates: number }>,
): number => {
  let totalCost = 0;
  for (const [model, tokens] of Object.entries(modelTokens)) {
    totalCost += calculateCost(tokens.prompt, tokens.candidates, model);
  }
  return totalCost;
};

/**
 * Formats a cost value for display.
 * Shows cents for small amounts, dollars for larger.
 * Examples: "$0.02", "$1.23", "<$0.01"
 */
export const formatCost = (cost: number): string => {
  if (cost === 0) {
    return '$0';
  }
  if (cost < 0.01) {
    return '<$0.01';
  }

  const rounded = Math.round(cost * 100) / 100;
  return `$${rounded.toFixed(2)}`;
};
