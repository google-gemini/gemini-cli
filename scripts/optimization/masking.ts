/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility to protect TypeScript template variables from being "optimized" by the LLM.
 * Replaces ${VAR} with unique stable tokens and allows for perfect restoration.
 */

export interface MaskResult {
  maskedText: string;
  maskMap: Record<string, string>;
}

const MASK_PREFIX = '[[GCLI_VAR_';
const MASK_SUFFIX = ']]';

/**
 * Replaces all instances of ${VARIABLE_NAME} with indexed tokens.
 * Supports both SCREAMING_SNAKE_CASE and camelCase variables.
 */
export function maskVariables(text: string): MaskResult {
  const maskMap: Record<string, string> = {};
  // Refined regex to capture any variable pattern like ${variableName} or ${VARIABLE_NAME}
  const variableRegex = /\${[a-zA-Z0-9_.]+}/g;
  let index = 0;
  let maskedText = text;

  // Find all unique variables
  const uniqueVars = Array.from(new Set(text.match(variableRegex) || []));

  uniqueVars.forEach((v) => {
    const token = `${MASK_PREFIX}${index}${MASK_SUFFIX}`;
    maskMap[token] = v;
    // Use a global regex for the specific variable to replace all occurrences
    maskedText = maskedText.split(v).join(token);
    index++;
  });

  return { maskedText, maskMap };
}

/**
 * Restores original ${VARIABLE_NAME} patterns using the provided mask map.
 */
export function unmaskVariables(
  text: string,
  maskMap: Record<string, string>,
): string {
  let unmaskedText = text;
  // Sort tokens by length descending to prevent partial replacement (e.g. VAR_10 before VAR_1)
  const sortedTokens = Object.keys(maskMap).sort((a, b) => b.length - a.length);

  sortedTokens.forEach((token) => {
    const originalVar = maskMap[token];
    unmaskedText = unmaskedText.split(token).join(originalVar);
  });
  return unmaskedText;
}
