/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from './debugLogger.js';

/**
 * Detects the actual image MIME type by inspecting the magic bytes (file signature)
 * of base64 encoded data. Supports PNG, WebP, JPEG, and GIF.
 *
 * @param base64Data The base64 encoded string of the image.
 * @returns The detected MIME type (e.g. 'image/webp') or null if not detected/unsupported.
 */
export function detectImageMimeType(base64Data: string): string | null {
  if (!base64Data) {
    return null;
  }
  try {
    // Take a small prefix of the base64 data and strip whitespace.
    // 48 characters of base64 yields up to 36 bytes of binary data.
    const cleanPrefix = base64Data.trimStart().slice(0, 48).replace(/\s+/g, '');
    const buffer = Buffer.from(cleanPrefix, 'base64');
    if (buffer.length < 4) {
      return null;
    }

    // PNG: 89 50 4E 47
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'image/png';
    }

    // WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 && // F
      buffer[8] === 0x57 && // W
      buffer[9] === 0x45 && // E
      buffer[10] === 0x42 && // B
      buffer[11] === 0x50 // P
    ) {
      return 'image/webp';
    }

    // JPEG: FF D8 FF
    if (
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return 'image/jpeg';
    }

    // GIF: GIF (47 49 46)
    if (
      buffer[0] === 0x47 && // G
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 // F
    ) {
      return 'image/gif';
    }
  } catch {
    // Return null on any decode errors
  }
  return null;
}

/**
 * Validates the declared MIME type against the actual format detected from the base64 data.
 * If a mismatch is detected, it logs a warning and returns the corrected MIME type.
 * Otherwise, it returns the declared MIME type.
 *
 * @param declaredMimeType The declared MIME type.
 * @param base64Data The base64 encoded string of the image.
 * @returns The corrected or original MIME type.
 */
export function validateAndCorrectMimeType(
  declaredMimeType: string,
  base64Data: string,
): string {
  const lowerDeclared = declaredMimeType.toLowerCase();
  const isImageOrGeneric =
    lowerDeclared.startsWith('image/') ||
    lowerDeclared === 'application/octet-stream' ||
    lowerDeclared === 'unknown type';

  if (!isImageOrGeneric) {
    return declaredMimeType;
  }

  const detectedType = detectImageMimeType(base64Data);
  if (detectedType && detectedType !== declaredMimeType) {
    debugLogger.warn(
      `Image MIME type mismatch: declared as ${declaredMimeType} but detected as ${detectedType}`,
    );
    return detectedType;
  }
  return declaredMimeType;
}
