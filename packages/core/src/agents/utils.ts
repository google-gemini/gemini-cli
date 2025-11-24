/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentInputs } from './types.js';

/**
 * Replaces `${...}` placeholders in a template string with values from AgentInputs.
 *
 * @param template The template string containing placeholders.
 * @param inputs The AgentInputs object providing placeholder values.
 * @returns The populated string with all placeholders replaced.
 * @throws {Error} if any placeholder key is not found in the inputs.
 */
export function templateString(template: string, inputs: AgentInputs): string {
  const placeholderRegex = /\$\{(\w+)\}/g;

  // First, find all unique keys required by the template.
  const requiredKeys = new Set(
    Array.from(template.matchAll(placeholderRegex), (match) => match[1]),
  );

  // Check if all required keys exist in the inputs.
  const inputKeys = new Set(Object.keys(inputs));
  const missingKeys = Array.from(requiredKeys).filter(
    (key) => !inputKeys.has(key),
  );

  if (missingKeys.length > 0) {
    // Enhanced error message showing both missing and available keys
    throw new Error(
      `Template validation failed: Missing required input parameters: ${missingKeys.join(', ')}. ` +
        `Available inputs: ${Object.keys(inputs).join(', ')}`,
    );
  }

  // Perform the replacement using a replacer function.
  return template.replace(placeholderRegex, (_match, key) =>
    String(inputs[key]),
  );
}
