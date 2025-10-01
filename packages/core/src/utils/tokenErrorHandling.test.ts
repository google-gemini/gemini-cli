/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TokenManager,
  DEFAULT_TOKEN_CONFIG,
  TokenStatus,
  isTokenLimitExceededError,
  isTokenLimitError,
  extractTokenInfo,
  getTokenLimitErrorMessage,
  estimateTokenCount,
} from '../utils/tokenErrorHandling.js';
import {
  ContextCompressor,
  CompressionStrategy,
  TokenErrorRetryHandler,
  type CompressionOptions,
} from '../utils/contextCompression.js';
import {
  ProactiveTokenMonitor,
  DEFAULT_MONITORING_CONFIG,
  formatTokenUsage,
  createTokenUsageProgressBar,
} from '../utils/proactiveTokenMonitoring.js';
import type { Content } from '@google/genai';

describe('Token Error Handling', () => {
  let tokenManager: TokenManager;

  beforeEach(() => {
    tokenManager = new TokenManager(DEFAULT_TOKEN_CONFIG);
  });

  describe('TokenManager', () => {
    it('should initialize with zero usage', () => {
      expect(tokenManager.getCurrentUsage()).toBe(0);
      expect(tokenManager.getRemainingCapacity()).toBe(
        DEFAULT_TOKEN_CONFIG.maxTokens,
      );
    });

    it('should check token limits correctly', () => {
      expect(tokenManager.checkTokenLimit(100)).toBe(TokenStatus.OK);

      // Set high usage to trigger warning
      tokenManager.updateTokenUsage({
        promptTokens: 800000,
        completionTokens: 0,
        totalTokens: 800000,
      });
      expect(tokenManager.checkTokenLimit(100000)).toBe(TokenStatus.WARNING);

      // Test limit exceeded
      expect(tokenManager.checkTokenLimit(300000)).toBe(
        TokenStatus.LIMIT_EXCEEDED,
      );
    });

    it('should update token usage', () => {
      tokenManager.updateTokenUsage({
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      });

      expect(tokenManager.getCurrentUsage()).toBe(1500);
      expect(tokenManager.getRemainingCapacity()).toBe(
        DEFAULT_TOKEN_CONFIG.maxTokens - 1500,
      );
    });

    it('should reset token usage', () => {
      tokenManager.updateTokenUsage({
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
      });

      tokenManager.resetTokenUsage();
      expect(tokenManager.getCurrentUsage()).toBe(0);
    });

    it('should recommend compression when threshold exceeded', () => {
      tokenManager.updateTokenUsage({
        promptTokens: 800000,
        completionTokens: 0,
        totalTokens: 800000,
      });

      expect(tokenManager.shouldCompress()).toBe(true);
    });
  });

  describe('Token Error Detection', () => {
    it('should detect token limit exceeded errors', () => {
      const errorString =
        'The input token count (5911388) exceeds the maximum number of tokens allowed (1048576).';
      expect(isTokenLimitExceededError(errorString)).toBe(true);
    });

    it('should detect token limit errors (boolean version)', () => {
      const errorString =
        'The input token count (5911388) exceeds the maximum number of tokens allowed (1048576).';
      expect(isTokenLimitError(errorString)).toBe(true);

      // Test with Error object
      const errorObj = new Error(
        'The input token count (5911388) exceeds the maximum number of tokens allowed (1048576).',
      );
      expect(isTokenLimitError(errorObj)).toBe(true);

      // Test with nested error object
      const nestedError = {
        error: {
          message:
            'The input token count (5911388) exceeds the maximum number of tokens allowed (1048576).',
        },
      };
      expect(isTokenLimitError(nestedError)).toBe(true);

      // Test non-token error
      const nonTokenError = new Error('Some other error');
      expect(isTokenLimitError(nonTokenError)).toBe(false);
    });

    it('should extract token information from error', () => {
      const errorString =
        'The input token count (5911388) exceeds the maximum number of tokens allowed (1048576).';
      const tokenInfo = extractTokenInfo(errorString);

      expect(tokenInfo).toEqual({
        current: 5911388,
        max: 1048576,
      });
    });

    it('should generate user-friendly error messages', () => {
      const tokenLimitError = {
        kind: 'token-limit-exceeded' as const,
        currentTokens: 5911388,
        maxTokens: 1048576,
        message: 'Token limit exceeded',
      };

      const message = getTokenLimitErrorMessage(tokenLimitError);
      expect(message).toContain('⚠️');
      expect(message).toContain('5,911,388');
      expect(message).toContain('1,048,576');
    });

    it('should estimate token count correctly', () => {
      const content = [
        { role: 'user' as const, parts: [{ text: 'Hello world' }] },
        { role: 'assistant' as const, parts: [{ text: 'Hi there!' }] },
      ];

      const estimatedTokens = estimateTokenCount(content);
      // "Hello world" = 11 chars → Math.ceil(11/4) = 3 tokens
      // "Hi there!" = 9 chars → Math.ceil(9/4) = 3 tokens
      // Total = 6 tokens
      expect(estimatedTokens).toBe(6);
    });

    it('should handle empty content', () => {
      const content: Content[] = [];
      const estimatedTokens = estimateTokenCount(content);
      expect(estimatedTokens).toBe(0);
    });

    it('should handle content without text parts', () => {
      const content = [
        { role: 'user' as const, parts: [{ functionCall: { name: 'test' } }] },
      ];
      const estimatedTokens = estimateTokenCount(content);
      expect(estimatedTokens).toBe(0);
    });
  });
});

describe('Context Compression', () => {
  let compressor: ContextCompressor;
  let tokenManager: TokenManager;

  beforeEach(() => {
    tokenManager = new TokenManager(DEFAULT_TOKEN_CONFIG);
    compressor = new ContextCompressor(tokenManager);
  });

  const createTestContent = (count: number): Content[] =>
    Array.from({ length: count }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      parts: [
        { text: `Message ${i}: This is a test message with some content.` },
      ],
    }));

  describe('Compression Strategies', () => {
    it('should compress using chunk and summarize strategy', async () => {
      const content = createTestContent(10);
      const options: CompressionOptions = {
        strategy: CompressionStrategy.CHUNK_AND_SUMMARIZE,
        maxTokens: 1000,
        preserveRecent: 3,
        summaryRatio: 0.3,
      };

      const result = await compressor.compressContext(content, options);

      expect(result.compressedContent.length).toBeLessThan(content.length);
      expect(result.strategy).toBe(CompressionStrategy.CHUNK_AND_SUMMARIZE);
      expect(result.compressionRatio).toBe(options.summaryRatio);
    });

    it('should compress using reduce context strategy', async () => {
      const content = createTestContent(10);
      const options: CompressionOptions = {
        strategy: CompressionStrategy.REDUCE_CONTEXT,
        maxTokens: 1000,
        preserveRecent: 3,
        summaryRatio: 0.5,
      };

      const result = await compressor.compressContext(content, options);

      expect(result.compressedContent.length).toBeLessThan(content.length);
      expect(result.strategy).toBe(CompressionStrategy.REDUCE_CONTEXT);
    });

    it('should compress using prioritize recent strategy', async () => {
      const content = createTestContent(10);
      const options: CompressionOptions = {
        strategy: CompressionStrategy.PRIORITIZE_RECENT,
        maxTokens: 1000,
        preserveRecent: 3,
        summaryRatio: 0.4,
      };

      const result = await compressor.compressContext(content, options);

      expect(result.compressedContent.length).toBe(content.length);
      expect(result.strategy).toBe(CompressionStrategy.PRIORITIZE_RECENT);
    });

    it('should compress using compress history strategy', async () => {
      const content = createTestContent(10);
      const options: CompressionOptions = {
        strategy: CompressionStrategy.COMPRESS_HISTORY,
        maxTokens: 1000,
        preserveRecent: 3,
        summaryRatio: 0.3,
      };

      const result = await compressor.compressContext(content, options);

      expect(result.compressedContent.length).toBeLessThan(content.length);
      expect(result.strategy).toBe(CompressionStrategy.COMPRESS_HISTORY);
    });
  });
});

describe('Token Error Retry Handler', () => {
  let retryHandler: TokenErrorRetryHandler;
  let tokenManager: TokenManager;

  beforeEach(() => {
    tokenManager = new TokenManager(DEFAULT_TOKEN_CONFIG);
    retryHandler = new TokenErrorRetryHandler(tokenManager);
  });

  it('should handle successful API calls', async () => {
    const content = [{ role: 'user' as const, parts: [{ text: 'Hello' }] }];
    const mockApiCall = vi.fn().mockResolvedValue({ success: true });

    const result = await retryHandler.handleTokenLimitError(
      content,
      mockApiCall,
    );

    expect(result).toEqual({ success: true });
    expect(mockApiCall).toHaveBeenCalledTimes(1);
  });

  it('should retry with compression on token limit error', async () => {
    const content = Array.from({ length: 100 }, (_, i) => ({
      role: 'user' as const,
      parts: [
        {
          text: `Message ${i}: This is a very long message that would exceed token limits.`.repeat(
            10,
          ),
        },
      ],
    }));

    let callCount = 0;
    const mockApiCall = vi
      .fn()
      .mockImplementation(async (compressedContent: Content[]) => {
        callCount++;
        if (callCount === 1) {
          // First call fails with token limit error
          throw new Error(
            'The input token count (5911388) exceeds the maximum number of tokens allowed (1048576).',
          );
        }
        // Second call succeeds
        return { success: true, compressedLength: compressedContent.length };
      });

    const result = await retryHandler.handleTokenLimitError(
      content,
      mockApiCall,
    );

    expect(result).toEqual({
      success: true,
      compressedLength: expect.any(Number),
    });
    expect(callCount).toBe(2);
    expect(mockApiCall).toHaveBeenCalledWith(expect.arrayContaining([]));
  });
});

describe('Proactive Token Monitoring', () => {
  let monitor: ProactiveTokenMonitor;
  let tokenManager: TokenManager;

  beforeEach(() => {
    tokenManager = new TokenManager(DEFAULT_TOKEN_CONFIG);
    monitor = new ProactiveTokenMonitor(
      tokenManager,
      DEFAULT_MONITORING_CONFIG,
    );
  });

  it('should initialize with correct configuration', () => {
    const stats = monitor.getTokenStatistics();
    expect(stats.current).toBe(0);
    expect(stats.max).toBe(DEFAULT_TOKEN_CONFIG.maxTokens);
    expect(stats.usagePercent).toBe(0);
  });

  it('should trigger alerts when thresholds are exceeded', () => {
    const alertCallback = vi.fn();
    monitor.addAlertCallback(alertCallback);

    // Simulate high token usage
    tokenManager.updateTokenUsage({
      promptTokens: 800000,
      completionTokens: 0,
      totalTokens: 800000,
    });

    monitor.checkTokenUsage();

    expect(alertCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warning',
        message: expect.stringContaining('Token usage is high'),
      }),
    );
  });

  it('should provide compression recommendations', () => {
    // Normal usage
    let recommendation = monitor.getCompressionRecommendation();
    expect(recommendation.shouldCompress).toBe(false);

    // High usage
    tokenManager.updateTokenUsage({
      promptTokens: 800000,
      completionTokens: 0,
      totalTokens: 800000,
    });

    recommendation = monitor.getCompressionRecommendation();
    expect(recommendation.shouldCompress).toBe(true);
    expect(recommendation.compressionRatio).toBeLessThan(1);
  });

  it('should format token usage correctly', () => {
    tokenManager.updateTokenUsage({
      promptTokens: 500000,
      completionTokens: 0,
      totalTokens: 500000,
    });

    const stats = monitor.getTokenStatistics();
    const formatted = formatTokenUsage(stats);

    expect(formatted).toContain('500,000');
    expect(formatted).toContain('1,048,576');
    expect(formatted).toContain('48%');
  });

  it('should create progress bar', () => {
    tokenManager.updateTokenUsage({
      promptTokens: 500000,
      completionTokens: 0,
      totalTokens: 500000,
    });

    const stats = monitor.getTokenStatistics();
    const progressBar = createTokenUsageProgressBar(stats);

    expect(progressBar).toContain('🟢');
    expect(progressBar).toContain('48%');
  });
});
