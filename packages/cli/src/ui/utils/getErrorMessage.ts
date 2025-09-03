/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import i18n from '../../i18n/index.js';

/**
 * Get internationalized error message with fallback to original message
 */
export function getErrorMessage(
  translationKey: string,
  fallbackMessage: string,
  params: Record<string, string | number> = {},
): string {
  try {
    // Try to get translation from errors namespace
    const translatedMessage = i18n.t(translationKey, {
      ns: 'errors',
      ...params,
    });

    // If translation exists and is not the key itself, use it
    if (
      translatedMessage &&
      translatedMessage !== translationKey &&
      translatedMessage !== `errors:${translationKey}`
    ) {
      return translatedMessage;
    }
  } catch (error) {
    // Ignore translation errors and fall back
  }

  // Fallback to original message
  return fallbackMessage;
}
