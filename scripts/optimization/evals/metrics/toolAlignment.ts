/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '../../../../packages/core/src/utils/debugLogger.js';
import type { Scenario, ToolCall } from '../schema.js';
import { DEFAULT_EVAL_CONFIG } from '../config.js';
import { MetricObjective } from '../types.js';
import type { MetricResult } from '../types.js';

/**
 * Evaluates the alignment of a model's predicted tool calls against a golden scenario.
 * Focuses strictly on functional correctness (tool selection and argument precision).
 */
export function evaluateToolAlignment(
  prediction: { tool_calls: ToolCall[] },
  example: Scenario,
  config = DEFAULT_EVAL_CONFIG.objectives.alignment,
): MetricResult {
  const { tool_calls: predictedCalls } = prediction;
  const { expected, negatives, id: scenarioId } = example;

  debugLogger.debug(`[Eval:${scenarioId}] Evaluating tool alignment...`);

  // 1. Check for Hard Failures (Explicit Negatives)
  // These are for specific "Forbidden" tool uses (e.g., using shell instead of read_file)
  for (const negative of negatives) {
    const isNegativeMatch = negative.tool_calls.every((negCall: ToolCall) =>
      predictedCalls.some(
        (predCall: ToolCall) =>
          predCall.name === negCall.name &&
          areArgsMatching(negCall.arguments, predCall.arguments),
      ),
    );

    if (isNegativeMatch && negative.tool_calls.length > 0) {
      return {
        score: config.hardFailureScore,
        objective: MetricObjective.ALIGNMENT,
        reason: `Hard Failure: ${negative.reason}`,
        metadata: { matchedNegativeReason: negative.reason },
      };
    }
  }

  // 2. Structural Check
  if (predictedCalls.length === 0) {
    return {
      score: config.invalidResponseScore,
      objective: MetricObjective.ALIGNMENT,
      reason: 'Model failed to produce any tool calls.',
    };
  }

  // 3. Functional Alignment Check
  const expectedCalls = expected.tool_calls;

  // Check if all expected tool names are present
  const namesMatch = expectedCalls.every((exp: ToolCall) =>
    predictedCalls.some((pred: ToolCall) => pred.name === exp.name),
  );

  if (!namesMatch) {
    return {
      score: config.invalidResponseScore,
      objective: MetricObjective.ALIGNMENT,
      reason: 'Model selected the wrong tool(s).',
    };
  }

  // Check for Argument Precision
  const argsMatch = expectedCalls.every((exp: ToolCall) =>
    predictedCalls.some(
      (pred: ToolCall) =>
        pred.name === exp.name &&
        areArgsMatching(exp.arguments, pred.arguments),
    ),
  );

  if (!argsMatch) {
    return {
      score: config.toolNameMatchOnlyScore,
      objective: MetricObjective.ALIGNMENT,
      reason: 'Correct tool selected, but arguments are incorrect or missing.',
    };
  }

  // 4. Perfect Success
  return {
    score: config.functionalSuccessScore,
    objective: MetricObjective.ALIGNMENT,
    reason: 'Functional Success: Tool and arguments align perfectly.',
  };
}

/**
 * Deep equality check for tool arguments.
 */
function areArgsMatching(
  expected: Record<string, unknown>,
  predicted: Record<string, unknown>,
): boolean {
  return JSON.stringify(expected) === JSON.stringify(predicted);
}
