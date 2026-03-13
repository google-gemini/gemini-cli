/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @license
 */

export const MODEL_COSTS_PER_1M_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  'gemini-3.1-pro-preview': { input: 1.25, output: 5.0 },
  'gemini-3.1-flash-preview': { input: 0.075, output: 0.3 },
  'gemini-2.5-pro': { input: 1.25, output: 5.0 },
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.5-flash-lite': { input: 0.075, output: 0.3 },
};
export function calculateCost(
  modelName: string,
  promptTokens: number,
  candidateTokens: number,
): number {
  const pricing =
    MODEL_COSTS_PER_1M_TOKENS[modelName] ||
    MODEL_COSTS_PER_1M_TOKENS['gemini-2.5-flash'];

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (candidateTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}
export function formatCostEstimate(cost: number): string {
  if (cost === 0) return '$0.00';
  // For micro-transactions (like small CLI prompts), show extra precision
  if (cost < 0.01) return `~$${cost.toFixed(4)}`;
  return `~$${cost.toFixed(2)}`;
}
