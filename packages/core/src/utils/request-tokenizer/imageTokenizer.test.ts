/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ImageTokenizer } from './imageTokenizer.js';

describe('ImageTokenizer', () => {
  const tokenizer = new ImageTokenizer();
  const EXPECTED_TOKENS = 258; // Standard Gemini image token count

  describe('calculateTokens', () => {
    it('should calculate tokens for a standard image', () => {
      const metadata = {
        width: 1024,
        height: 768,
        mimeType: 'image/png',
        dataSize: 100000,
      };

      const tokens = tokenizer.calculateTokens(metadata);

      // Should be fixed 258
      expect(tokens).toBe(EXPECTED_TOKENS);
    });

    it('should return standard tokens for very large images (no scaling)', () => {
      const metadata = {
        width: 10000,
        height: 10000,
        mimeType: 'image/png',
        dataSize: 10000000,
      };

      const tokens = tokenizer.calculateTokens(metadata);

      // Should still be fixed 258
      expect(tokens).toBe(EXPECTED_TOKENS);
    });

    it('should return standard tokens for very small images', () => {
      const metadata = {
        width: 10,
        height: 10,
        mimeType: 'image/png',
        dataSize: 100,
      };

      const tokens = tokenizer.calculateTokens(metadata);

      // Should be fixed 258
      expect(tokens).toBe(EXPECTED_TOKENS);
    });
  });

  describe('extractImageMetadata', () => {
    it('should return default dimensions for unsupported formats', async () => {
      const metadata = await tokenizer.extractImageMetadata(
        'invalid-data',
        'image/unknown',
      );

      expect(metadata.width).toBe(512);
      expect(metadata.height).toBe(512);
    });

    it('should return default dimensions for invalid base64 data', async () => {
      const metadata = await tokenizer.extractImageMetadata(
        'not-valid-base64!!!',
        'image/png',
      );

      // Should fallback to defaults
      expect(metadata.width).toBe(512);
      expect(metadata.height).toBe(512);
    });
  });

  describe('calculateTokensBatch', () => {
    it('should calculate tokens for multiple images', async () => {
      const images = [
        { data: 'data1', mimeType: 'image/png' },
        { data: 'data2', mimeType: 'image/jpeg' },
      ];

      // Mock extractImageMetadata since we don't have real base64 data here
      // and we want to test the batch logic, not extraction
      const originalExtract = tokenizer.extractImageMetadata;
      tokenizer.extractImageMetadata = async (data, mimeType) => ({
        width: 100,
        height: 100,
        mimeType,
        dataSize: 100,
      });

      const tokens = await tokenizer.calculateTokensBatch(images);

      // Restore original method
      tokenizer.extractImageMetadata = originalExtract;

      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toBe(EXPECTED_TOKENS);
      expect(tokens[1]).toBe(EXPECTED_TOKENS);
    });
  });
});
