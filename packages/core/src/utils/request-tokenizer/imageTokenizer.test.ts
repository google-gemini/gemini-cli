/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ImageTokenizer } from './imageTokenizer.js';

describe('ImageTokenizer', () => {
  const tokenizer = new ImageTokenizer();

  describe('calculateTokens', () => {
    it('should calculate tokens for a standard image', () => {
      const metadata = {
        width: 1024,
        height: 768,
        mimeType: 'image/png',
        dataSize: 100000,
      };

      const tokens = tokenizer.calculateTokens(metadata);

      // 1024*768 = 786,432 pixels
      // Normalized: width=1008 (36*28), height=784 (28*28)
      // Tokens: (1008*784)/784 + 2 = 1008 + 2 = 1010
      expect(tokens).toBeGreaterThan(500);
      expect(tokens).toBeLessThan(2000);
    });

    it('should cap tokens at MAX_TOKENS for very large images', () => {
      const metadata = {
        width: 10000,
        height: 10000,
        mimeType: 'image/png',
        dataSize: 10000000,
      };

      const tokens = tokenizer.calculateTokens(metadata);

      // Should be capped at 16384 + 2 special tokens = 16386
      expect(tokens).toBeLessThanOrEqual(16386);
    });

    it('should enforce MIN_TOKENS for very small images', () => {
      const metadata = {
        width: 10,
        height: 10,
        mimeType: 'image/png',
        dataSize: 100,
      };

      const tokens = tokenizer.calculateTokens(metadata);

      // Should be at least 4 + 2 special tokens = 6
      expect(tokens).toBeGreaterThanOrEqual(6);
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

      const tokens = await tokenizer.calculateTokensBatch(images);

      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toBeGreaterThan(0);
      expect(tokens[1]).toBeGreaterThan(0);
    });
  });
});
