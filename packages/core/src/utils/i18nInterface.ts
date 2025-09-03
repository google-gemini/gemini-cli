/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Translation function type for error messages
 */
export type ErrorTranslationFunction = (
  key: string,
  fallback: string,
  params?: Record<string, string | number>,
) => string;

/**
 * Global error translation function - will be set by the CLI package
 */
let globalErrorTranslator: ErrorTranslationFunction | null = null;

/**
 * Register a translation function for error messages
 */
export function setErrorTranslator(translator: ErrorTranslationFunction): void {
  globalErrorTranslator = translator;
}

/**
 * Get translated error message with fallback
 */
export function getTranslatedErrorMessage(
  key: string,
  fallback: string,
  params?: Record<string, string | number>,
): string {
  if (globalErrorTranslator) {
    try {
      return globalErrorTranslator(key, fallback, params);
    } catch (_error) {
      // If translation fails, fall back to original message
    }
  }
  return fallback;
}
