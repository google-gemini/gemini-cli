/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuotaEstimator } from './quotaEstimation.js';

describe('QuotaEstimator', () => {
  let mockContentGenerator: any;
  let quotaEstimator: QuotaEstimator;

  beforeEach(() => {
    mockContentGenerator = {
      countTokens: vi.fn(),
    };
    quotaEstimator = new QuotaEstimator(mockContentGenerator);
  });

  describe('estimateQuotaUsage', () => {
    it('should estimate quota usage with successful token counting', async () => {
      const mockResponse = { totalTokens: 150 };
      mockContentGenerator.countTokens.mockResolvedValue(mockResponse);

      const result = await quotaEstimator.estimateQuotaUsage(
        [{ text: 'Hello, how are you?' }],
        { model: 'gemini-2.5-flash' }
      );

      expect(result.inputTokens).toBe(150);
      expect(result.model).toBe('gemini-2.5-flash');
      expect(result.isEstimate).toBe(true);
      expect(result.totalTokens).toBeGreaterThan(result.inputTokens);
    });

    it('should handle countTokens failure gracefully', async () => {
      mockContentGenerator.countTokens.mockRejectedValue(new Error('API Error'));

      const result = await quotaEstimator.estimateQuotaUsage(
        [{ text: 'Hello, how are you?' }],
        { model: 'gemini-2.5-flash' }
      );

      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.model).toBe('gemini-2.5-flash');
      expect(result.isEstimate).toBe(true);
    });

    it('should handle undefined totalTokens', async () => {
      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: undefined });

      const result = await quotaEstimator.estimateQuotaUsage(
        [{ text: 'Hello, how are you?' }],
        { model: 'gemini-2.5-flash' }
      );

      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.model).toBe('gemini-2.5-flash');
      expect(result.isEstimate).toBe(true);
    });
  });

  describe('estimateOutputTokens', () => {
    it('should use maxOutputTokens when provided', async () => {
      const result = await quotaEstimator.estimateQuotaUsage(
        [{ text: 'Hello' }],
        { 
          model: 'gemini-2.5-flash',
          maxOutputTokens: 1000
        }
      );

      expect(result.estimatedOutputTokens).toBe(1000);
    });

    it('should estimate based on model characteristics', async () => {
      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 100 });

      const proResult = await quotaEstimator.estimateQuotaUsage(
        [{ text: 'Hello' }],
        { model: 'gemini-2.5-pro' }
      );

      const flashResult = await quotaEstimator.estimateQuotaUsage(
        [{ text: 'Hello' }],
        { model: 'gemini-2.5-flash' }
      );

      // Pro models should estimate higher output tokens than Flash models
      expect(proResult.estimatedOutputTokens).toBeGreaterThan(flashResult.estimatedOutputTokens);
    });
  });

  describe('fallbackTokenEstimate', () => {
    it('should estimate tokens from string content', async () => {
      mockContentGenerator.countTokens.mockRejectedValue(new Error('API Error'));

      const result = await quotaEstimator.estimateQuotaUsage(
        'Hello, this is a test message with some content',
        { model: 'gemini-2.5-flash' }
      );

      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.inputTokens).toBeLessThanOrEqual(50); // Rough estimate for the text length
    });

    it('should handle array of parts', async () => {
      mockContentGenerator.countTokens.mockRejectedValue(new Error('API Error'));

      const result = await quotaEstimator.estimateQuotaUsage(
        [
          { text: 'First part' },
          { text: 'Second part' }
        ],
        { model: 'gemini-2.5-flash' }
      );

      expect(result.inputTokens).toBeGreaterThan(0);
    });

    it('should handle multimodal content with images', async () => {
      mockContentGenerator.countTokens.mockRejectedValue(new Error('API Error'));

      const result = await quotaEstimator.estimateQuotaUsage(
        [
          { text: 'Describe this image' },
          { inlineData: { data: 'base64encodedimagedata', mimeType: 'image/jpeg' } }
        ],
        { model: 'gemini-2.5-flash' }
      );

      expect(result.inputTokens).toBeGreaterThan(250); // Should account for image data
    });

    it('should handle function calls in content', async () => {
      mockContentGenerator.countTokens.mockRejectedValue(new Error('API Error'));

      const result = await quotaEstimator.estimateQuotaUsage(
        [
          { text: 'Call this function' },
          { functionCall: { name: 'testFunction', args: { param: 'value' } } }
        ],
        { model: 'gemini-2.5-flash' }
      );

      expect(result.inputTokens).toBeGreaterThan(250); // Should account for function call
    });

    it('should handle mixed content types', async () => {
      mockContentGenerator.countTokens.mockRejectedValue(new Error('API Error'));

      const result = await quotaEstimator.estimateQuotaUsage(
        [
          { text: 'Process this data' },
          { fileData: { mimeType: 'text/plain', data: 'file content' } },
          { inlineData: { data: 'image', mimeType: 'image/png' } }
        ],
        { model: 'gemini-2.5-flash' }
      );

      expect(result.inputTokens).toBeGreaterThan(500); // Should account for all content types (expected ~509)
    });
  });

  describe('formatQuotaEstimate', () => {
    it('should format basic estimate', () => {
      const estimate = {
        inputTokens: 100,
        estimatedOutputTokens: 150,
        totalTokens: 250,
        model: 'gemini-2.5-flash',
        isEstimate: true,
      };

      const result = quotaEstimator.formatQuotaEstimate(estimate);
      
      expect(result).toContain('📊 Quota Estimate for gemini-2.5-flash');
      expect(result).toContain('Estimated total tokens: 250');
      expect(result).toContain('⚠️  Note: This is an estimate only');
    });

    it('should format detailed breakdown when requested', () => {
      const estimate = {
        inputTokens: 100,
        estimatedOutputTokens: 150,
        totalTokens: 250,
        model: 'gemini-2.5-flash',
        isEstimate: true,
      };

      const result = quotaEstimator.formatQuotaEstimate(estimate, { showDetailedBreakdown: true });
      
      expect(result).toContain('Input tokens: 100');
      expect(result).toContain('Estimated output tokens: 150');
      expect(result).toContain('Total estimated tokens: 250');
    });
  });
});
