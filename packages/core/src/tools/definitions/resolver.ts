/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionDeclaration } from '@google/genai';
import type { ToolDefinition } from './types.js';

/**
 * Resolves a model-specific declaration for a tool.
 *
 * @param definition The tool definition containing base and variants.
 * @param modelId The concrete model ID (e.g., 'gemini-1.5-flash').
 * @returns The final FunctionDeclaration to be sent to the API.
 */
export function resolveToolDeclaration(
  definition: ToolDefinition,
  modelId: string,
): FunctionDeclaration {
  const { base, variants } = definition;

  if (!variants) {
    return base;
  }

  // Simplified mapping logic: check if the modelId contains 'flash' or 'pro'.
  // This can be made more robust as needed.
  let variantKey: 'flash' | 'pro' | undefined;
  if (modelId.toLowerCase().includes('flash')) {
    variantKey = 'flash';
  } else if (modelId.toLowerCase().includes('pro')) {
    variantKey = 'pro';
  }

  const variant = variantKey ? variants[variantKey] : undefined;

  if (!variant) {
    return base;
  }

  // Deep merge strategy for the declaration.
  return {
    ...base,
    ...variant,
    parameters:
      variant.parameters && base.parameters
        ? {
            ...base.parameters,
            ...variant.parameters,
            properties: {
              ...(base.parameters.properties || {}),
              ...(variant.parameters.properties || {}),
            },
            required: variant.parameters.required || base.parameters.required,
          }
        : (variant.parameters ?? base.parameters),
  };
}
