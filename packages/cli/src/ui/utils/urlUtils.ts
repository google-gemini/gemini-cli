/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regex that matches RFC 3986 characters but strictly excludes common trailing punctuation
 * (.,;:!?) which is often part of the sentence, not the URL.
 * It explicitly excludes <, >, and control characters (security).
 */
export const URL_REGEX =
  /(https?:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=%]+[a-zA-Z0-9-_~/?#[\]@!$&'(*+=%])/i;

// Pre-compiled regex for checking if a string is a complete URL
const URL_MATCH_PATTERN = new RegExp(`^${URL_REGEX.source}$`, 'i');

/**
 * Checks if a string is a valid URL matching our URL_REGEX pattern.
 */
export const isUrl = (text: string): boolean => URL_MATCH_PATTERN.test(text);
