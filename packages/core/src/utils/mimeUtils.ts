/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This list is based on the supported file formats for Gemini 2.5 Pro.
// Source: https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-pro
//         https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash
const SUPPORTED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'video/x-flv',
  'video/quicktime',
  'video/mpeg',
  'video/mpegs',
  'video/mpg',
  'video/mp4',
  'video/webm',
  'video/wmv',
  'video/3gpp',
  'audio/x-aac',
  'audio/flac',
  'audio/mp3',
  'audio/m4a',
  'audio/mpeg',
  'audio/mpga',
  'audio/mp4',
  'audio/opus',
  'audio/pcm',
  'audio/wav',
  'audio/webm',
]);

/**
 * Checks if a given MIME type is in the supported set.
 * @param mimeType The MIME type string to validate.
 * @returns True if the MIME type is supported, false otherwise.
 */
export function isMimeTypeSupported(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.has(mimeType);
}

/**
 * Standardized error message for unsupported MIME types.
 */
export const UNSUPPORTED_MIME_TYPE_ERROR =
  'The MIME type of the file is not supported for inline content.';
