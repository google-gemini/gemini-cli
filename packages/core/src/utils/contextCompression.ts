/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import {
  TokenManager,
  TokenStatus,
  DEFAULT_TOKEN_CONFIG,
  estimateTokenCount,
  isTokenLimitError,
} from './tokenErrorHandling.js';

export enum CompressionStrategy {
  CHUNK_AND_SUMMARIZE = 'chunk_and_summarize',
  REDUCE_CONTEXT = 'reduce_context',
  PRIORITIZE_RECENT = 'prioritize_recent',
  COMPRESS_HISTORY = 'compress_history',
}

export interface CompressionOptions {
  readonly strategy: CompressionStrategy;
  readonly maxTokens: number;
  readonly preserveRecent: number; // Number of recent messages to preserve
  readonly summaryRatio: number; // 0.0 to 1.0, how much to compress
}

export interface ContextCompressionResult {
  readonly compressedContent: Content[];
  readonly compressionRatio: number;
  readonly tokensSaved: number;
  readonly strategy: CompressionStrategy;
}

export interface RetryOptions {
  readonly maxRetries: number;
  readonly backoffMultiplier: number;
  readonly compressionStrategies: CompressionStrategy[];
}

export class ContextCompressor {
  private readonly tokenManager: TokenManager;

  constructor(tokenManager?: TokenManager) {
    this.tokenManager = tokenManager || new TokenManager(DEFAULT_TOKEN_CONFIG);
  }

  /**
   * Compress context using the specified strategy
   */
  async compressContext(
    content: Content[],
    options: CompressionOptions,
  ): Promise<ContextCompressionResult> {
    switch (options.strategy) {
      case CompressionStrategy.CHUNK_AND_SUMMARIZE:
        return this.chunkAndSummarize(content, options);
      case CompressionStrategy.REDUCE_CONTEXT:
        return this.reduceContext(content, options);
      case CompressionStrategy.PRIORITIZE_RECENT:
        return this.prioritizeRecent(content, options);
      case CompressionStrategy.COMPRESS_HISTORY:
        return this.compressHistory(content, options);
      default:
        throw new Error(`Unknown compression strategy: ${options.strategy}`);
    }
  }

  /**
   * Chunk large content and summarize older chunks
   */
  private async chunkAndSummarize(
    content: Content[],
    options: CompressionOptions,
  ): Promise<ContextCompressionResult> {
    const recentMessages = content.slice(-options.preserveRecent);
    const olderMessages = content.slice(0, -options.preserveRecent);

    if (olderMessages.length === 0) {
      return {
        compressedContent: recentMessages,
        compressionRatio: 1.0,
        tokensSaved: 0,
        strategy: CompressionStrategy.CHUNK_AND_SUMMARIZE,
      };
    }

    // Create summary of older messages
    const summaryContent: Content = {
      role: 'system',
      parts: [
        {
          text: `[이전 대화 요약] ${olderMessages.length}개의 메시지가 요약되었습니다. 필요한 경우 더 자세한 정보를 요청해주세요.`,
        },
      ],
    };

    const compressedContent = [summaryContent, ...recentMessages];

    return {
      compressedContent,
      compressionRatio: options.summaryRatio,
      tokensSaved: Math.floor(
        olderMessages.length * (1 - options.summaryRatio) * 100,
      ), // Rough estimate
      strategy: CompressionStrategy.CHUNK_AND_SUMMARIZE,
    };
  }

  /**
   * Reduce context by removing less important messages
   */
  private async reduceContext(
    content: Content[],
    options: CompressionOptions,
  ): Promise<ContextCompressionResult> {
    const recentMessages = content.slice(-options.preserveRecent);
    const olderMessages = content.slice(0, -options.preserveRecent);

    // Keep only every nth message from older content
    const keepRatio = options.summaryRatio;
    const step = Math.max(1, Math.floor(1 / keepRatio));
    const filteredOlderMessages = olderMessages.filter(
      (_, index) => index % step === 0,
    );

    const compressedContent = [...filteredOlderMessages, ...recentMessages];

    return {
      compressedContent,
      compressionRatio: keepRatio,
      tokensSaved: olderMessages.length - filteredOlderMessages.length,
      strategy: CompressionStrategy.REDUCE_CONTEXT,
    };
  }

  /**
   * Prioritize recent messages and compress older ones
   */
  private async prioritizeRecent(
    content: Content[],
    options: CompressionOptions,
  ): Promise<ContextCompressionResult> {
    const recentMessages = content.slice(-options.preserveRecent);
    const olderMessages = content.slice(0, -options.preserveRecent);

    // Compress older messages more aggressively
    const compressedOlderMessages = olderMessages.map((msg) => ({
      ...msg,
      parts: msg.parts.map((part) => ({
        ...part,
        text: part.text
          ? this.compressText(part.text, options.summaryRatio)
          : part.text,
      })),
    }));

    const compressedContent = [...compressedOlderMessages, ...recentMessages];

    return {
      compressedContent,
      compressionRatio: options.summaryRatio,
      tokensSaved: Math.floor(
        olderMessages.length * (1 - options.summaryRatio) * 50,
      ), // Rough estimate
      strategy: CompressionStrategy.PRIORITIZE_RECENT,
    };
  }

  /**
   * Compress historical context by summarizing
   */
  private async compressHistory(
    content: Content[],
    options: CompressionOptions,
  ): Promise<ContextCompressionResult> {
    const recentMessages = content.slice(-options.preserveRecent);
    const olderMessages = content.slice(0, -options.preserveRecent);

    if (olderMessages.length === 0) {
      return {
        compressedContent: recentMessages,
        compressionRatio: 1.0,
        tokensSaved: 0,
        strategy: CompressionStrategy.COMPRESS_HISTORY,
      };
    }

    // Create a comprehensive summary of older messages
    const summaryText = this.createHistorySummary(olderMessages);
    const summaryContent: Content = {
      role: 'system',
      parts: [{ text: summaryText }],
    };

    const compressedContent = [summaryContent, ...recentMessages];

    return {
      compressedContent,
      compressionRatio: options.summaryRatio,
      tokensSaved: olderMessages.length * 80, // Rough estimate
      strategy: CompressionStrategy.COMPRESS_HISTORY,
    };
  }

  /**
   * Compress text by truncating and summarizing
   */
  private compressText(text: string, ratio: number): string {
    if (text.length <= 100) return text;

    const targetLength = Math.floor(text.length * ratio);
    if (targetLength <= 50) {
      return text.substring(0, 50) + '...';
    }

    // Try to break at word boundaries
    const truncated = text.substring(0, targetLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > targetLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Create a summary of historical messages
   */
  private createHistorySummary(messages: Content[]): string {
    const userMessages = messages.filter((msg) => msg.role === 'user').length;
    const assistantMessages = messages.filter(
      (msg) => msg.role === 'assistant',
    ).length;

    return `[Conversation history summary] There were ${userMessages} user messages and ${assistantMessages} assistant responses. Please ask for more details if needed.`;
  }
}

export class TokenErrorRetryHandler {
  private readonly compressor: ContextCompressor;
  private readonly tokenManager: TokenManager;
  private readonly defaultOptions: RetryOptions;
  private readonly logger?: (message: string) => void;

  constructor(
    tokenManager?: TokenManager,
    options?: Partial<RetryOptions>,
    logger?: (message: string) => void,
  ) {
    this.tokenManager = tokenManager || new TokenManager(DEFAULT_TOKEN_CONFIG);
    this.compressor = new ContextCompressor(this.tokenManager);
    this.logger = logger;
    this.defaultOptions = {
      maxRetries: 3,
      backoffMultiplier: 1.5,
      compressionStrategies: [
        CompressionStrategy.PRIORITIZE_RECENT,
        CompressionStrategy.REDUCE_CONTEXT,
        CompressionStrategy.COMPRESS_HISTORY,
        CompressionStrategy.CHUNK_AND_SUMMARIZE,
      ],
      ...options,
    };
  }

  /**
   * Handle token limit error with automatic retry and compression
   */
  async handleTokenLimitError<T>(
    content: Content[],
    apiCall: (compressedContent: Content[]) => Promise<T>,
    options?: Partial<RetryOptions>,
  ): Promise<T> {
    const retryOptions = { ...this.defaultOptions, ...options };
    let lastError: Error | null = null;
    let currentContent = [...content];

    for (let attempt = 0; attempt < retryOptions.maxRetries; attempt++) {
      try {
        // Check if we need compression before making the API call
        const estimatedTokens = estimateTokenCount(currentContent);
        const status = this.tokenManager.checkTokenLimit(estimatedTokens);

        if (status === TokenStatus.LIMIT_EXCEEDED) {
          // Apply compression strategy
          const strategy =
            retryOptions.compressionStrategies[
              attempt % retryOptions.compressionStrategies.length
            ];
          const compressionOptions: CompressionOptions = {
            strategy,
            maxTokens: this.tokenManager.getRemainingCapacity(),
            preserveRecent: Math.max(
              2,
              Math.floor(currentContent.length * 0.3),
            ), // Keep 30% as recent
            summaryRatio: Math.max(0.3, 1.0 - attempt * 0.2), // More aggressive compression on each retry
          };

          const compressionResult = await this.compressor.compressContext(
            currentContent,
            compressionOptions,
          );
          currentContent = compressionResult.compressedContent;

          this.logger?.(
            `🔄 Context compressed due to token limit. (${compressionResult.strategy}, ${compressionResult.tokensSaved} tokens saved)`,
          );
        }

        // Make the API call with compressed content
        const result = await apiCall(currentContent);

        // Update token usage on success
        this.tokenManager.updateTokenUsage({
          promptTokens: estimateTokenCount(currentContent),
          completionTokens: 0, // This would be updated with actual response
          totalTokens: estimateTokenCount(currentContent),
        });

        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if it's a token limit error
        if (isTokenLimitError(error)) {
          this.logger?.(
            `⚠️  Token limit error occurred (attempt ${attempt + 1}/${retryOptions.maxRetries})`,
          );

          // Apply exponential backoff
          if (attempt < retryOptions.maxRetries - 1) {
            const delay =
              Math.pow(retryOptions.backoffMultiplier, attempt) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } else {
          // Not a token limit error, re-throw immediately
          throw error;
        }
      }
    }

    // All retries failed
    throw new Error(
      `Unable to resolve token limit error after ${retryOptions.maxRetries} attempts: ${lastError?.message}`,
    );
  }
  /**
   * Get current token manager
   */
  getTokenManager(): TokenManager {
    return this.tokenManager;
  }
}
