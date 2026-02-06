/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';

/**
 * Renders text with styled interpolations for i18n.
 *
 * This implements the "Semantic Interpolation Pattern" for React Ink environments:
 * - Provides complete semantic context for translators
 * - Avoids fragmented translation keys
 * - Supports complex styling in terminal environments
 * - Compatible with React Ink's Text component limitations
 *
 * @param text - The translated text with {key} placeholders
 * @param styleMap - Map of keys to their styled React components
 * @param defaultColor - Default text color for the container
 * @returns Styled text component or throws error on mismatch
 * @throws Error when placeholders and styleMap don't match
 *
 * @example
 * // Translation: "Shell mode: Execute commands via {symbol} (e.g., {example})"
 * renderStyledText(t('shellMode'), {
 *   symbol: <Text bold color="purple">!</Text>,
 *   example: <Text bold color="purple">!npm start</Text>
 * }, 'white')
 */
export function renderStyledText(
  text: string,
  styleMap: Record<string, React.ReactNode>,
  defaultColor?: string,
): React.ReactElement {
  // Extract all placeholders from the text
  const placeholderMatches = text.match(/\{[^}]+\}/g) || [];
  const extractedPlaceholders = placeholderMatches.map((match) =>
    match.slice(1, -1),
  );

  // Get styleMap keys
  const styleMapKeys = Object.keys(styleMap);

  // Check for mismatches and provide detailed error messages
  const missingInStyleMap = extractedPlaceholders.filter(
    (key) => !styleMapKeys.includes(key),
  );
  const unusedInStyleMap = styleMapKeys.filter(
    (key) => !extractedPlaceholders.includes(key),
  );

  if (missingInStyleMap.length > 0 || unusedInStyleMap.length > 0) {
    const errors: string[] = [];

    if (missingInStyleMap.length > 0) {
      errors.push(
        `Missing style mappings for placeholders: {${missingInStyleMap.join('}, {')}}`,
      );
    }

    if (unusedInStyleMap.length > 0) {
      errors.push(`Unused style mappings: ${unusedInStyleMap.join(', ')}`);
    }

    throw new Error(
      `renderStyledText mismatch: ${errors.join('. ')}. ` +
        `Text: "${text}". ` +
        `Expected placeholders: [${extractedPlaceholders.join(', ')}]. ` +
        `Provided style mappings: [${styleMapKeys.join(', ')}].`,
    );
  }

  const parts = text.split(/(\{[^}]+\})/);

  return (
    <Text color={defaultColor}>
      {parts
        .map((part, _index) => {
          const match = part.match(/^\{([^}]+)\}$/);
          if (match) {
            const key = match[1];
            return styleMap[key]; // Now guaranteed to exist due to validation above
          }
          return part;
        })
        .map((element, idx) => (
          <React.Fragment key={idx}>{element}</React.Fragment>
        ))}
    </Text>
  );
}
