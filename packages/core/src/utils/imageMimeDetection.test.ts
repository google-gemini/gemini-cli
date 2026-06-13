/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectImageMimeType,
  validateAndCorrectMimeType,
} from './imageMimeDetection.js';
import { debugLogger } from './debugLogger.js';

describe('imageMimeDetection', () => {
  // Base64 helper strings representing magic bytes of various formats
  const pngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]).toString('base64');
  const webpBase64 = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x00, 0x00, 0x00, 0x00, // Size
    0x57, 0x45, 0x42, 0x50, // WEBP
    0x00, 0x00
  ]).toString('base64');
  const jpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00]).toString('base64');
  const gifBase64 = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]).toString('base64');
  const txtBase64 = Buffer.from('Hello world!').toString('base64');

  describe('detectImageMimeType', () => {
    it('should correctly detect PNG files', () => {
      expect(detectImageMimeType(pngBase64)).toBe('image/png');
    });

    it('should correctly detect WebP files', () => {
      expect(detectImageMimeType(webpBase64)).toBe('image/webp');
    });

    it('should correctly detect JPEG files', () => {
      expect(detectImageMimeType(jpegBase64)).toBe('image/jpeg');
    });

    it('should correctly detect GIF files', () => {
      expect(detectImageMimeType(gifBase64)).toBe('image/gif');
    });

    it('should return null for non-image / unknown files', () => {
      expect(detectImageMimeType(txtBase64)).toBeNull();
    });

    it('should return null for empty or invalid base64 data', () => {
      expect(detectImageMimeType('')).toBeNull();
      expect(detectImageMimeType('abc')).toBeNull(); // too short to decode 4 bytes
    });

    it('should handle whitespace/newlines in base64 data', () => {
      const formattedPng = pngBase64.match(/.{1,4}/g)?.join('\n') || pngBase64;
      expect(detectImageMimeType(formattedPng)).toBe('image/png');
    });

    it('should handle leading whitespace/newlines in base64 data', () => {
      expect(detectImageMimeType('   \n\r  ' + pngBase64)).toBe('image/png');
    });
  });

  describe('validateAndCorrectMimeType', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return original mime type if there is no mismatch', () => {
      expect(validateAndCorrectMimeType('image/png', pngBase64)).toBe('image/png');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should return corrected mime type and log a warning if there is a mismatch', () => {
      // e.g. Figma WebP labeled as PNG
      expect(validateAndCorrectMimeType('image/png', webpBase64)).toBe('image/webp');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain(
        'Image MIME type mismatch: declared as image/png but detected as image/webp'
      );
    });

    it('should fallback to declared mime type if image format is not detected', () => {
      expect(validateAndCorrectMimeType('application/octet-stream', txtBase64)).toBe(
        'application/octet-stream'
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should NOT correct mime type if the declared type is not an image or generic', () => {
      const textStartingWithGif = Buffer.from('GIF is an image format, not a text file').toString('base64');
      expect(validateAndCorrectMimeType('text/plain', textStartingWithGif)).toBe('text/plain');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
