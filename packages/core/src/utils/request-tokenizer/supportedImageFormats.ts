/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Supported image MIME types for vision models
 * These formats are supported by the vision model and can be processed by the image tokenizer
 */
export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/bmp',
  'image/jpeg',
  'image/jpg', // Alternative MIME type for JPEG
  'image/png',
  'image/tiff',
  'image/webp',
  'image/heic',
] as const;

/**
 * Type for supported image MIME types
 */
export type SupportedImageMimeType =
  (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

/**
 * Check if a MIME type is supported for vision processing
 * @param mimeType The MIME type to check
 * @returns True if the MIME type is supported
 */
export function isSupportedImageMimeType(
  mimeType: string,
): mimeType is SupportedImageMimeType {
  return SUPPORTED_IMAGE_MIME_TYPES.includes(
    mimeType as SupportedImageMimeType,
  );
}

/**
 * Get a human-readable list of supported image formats
 * @returns Comma-separated string of supported formats
 */
export function getSupportedImageFormatsString(): string {
  return SUPPORTED_IMAGE_MIME_TYPES.map((type) =>
    type.replace('image/', '').toUpperCase(),
  ).join(', ');
}

/**
 * Get warning message for unsupported image formats
 * @returns Warning message string
 */
export function getUnsupportedImageFormatWarning(): string {
  return `Only the following image formats are supported: ${getSupportedImageFormatsString()}. Other formats may not work as expected.`;
}
