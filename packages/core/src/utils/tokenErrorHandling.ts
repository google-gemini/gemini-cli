/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../core/contentGenerator.js';
import { UserTierId } from '../code_assist/types.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import type { Content } from '@google/genai';

export interface TokenLimitError {
  readonly kind: 'token-limit-exceeded';
  readonly currentTokens: number;
  readonly maxTokens: number;
  readonly message: string;
}

export interface TokenUsageInfo {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export enum TokenStatus {
  OK = 'ok',
  WARNING = 'warning',
  LIMIT_EXCEEDED = 'limit_exceeded',
}

export interface TokenManagerConfig {
  readonly maxTokens: number;
  readonly warningThreshold: number; // 0.0 to 1.0
  readonly compressionThreshold: number; // 0.0 to 1.0
}

export class TokenManager {
  private tokenUsage: number = 0;
  private readonly config: TokenManagerConfig;

  constructor(config: TokenManagerConfig) {
    this.config = config;
  }

  /**
   * Check if the projected token usage would exceed limits
   */
  checkTokenLimit(projectedTokens: number): TokenStatus {
    const totalProjected = this.tokenUsage + projectedTokens;

    if (totalProjected > this.config.maxTokens) {
      return TokenStatus.LIMIT_EXCEEDED;
    }

    if (totalProjected > this.config.maxTokens * this.config.warningThreshold) {
      return TokenStatus.WARNING;
    }

    return TokenStatus.OK;
  }

  /**
   * Update token usage after a successful API call
   */
  updateTokenUsage(usage: TokenUsageInfo): void {
    this.tokenUsage += usage.totalTokens;
  }

  /**
   * Reset token usage (e.g., when starting a new session)
   */
  resetTokenUsage(): void {
    this.tokenUsage = 0;
  }

  /**
   * Get current token usage
   */
  getCurrentUsage(): number {
    return this.tokenUsage;
  }

  /**
   * Get remaining token capacity
   */
  getRemainingCapacity(): number {
    return Math.max(0, this.config.maxTokens - this.tokenUsage);
  }

  /**
   * Check if compression is recommended
   */
  shouldCompress(): boolean {
    return (
      this.tokenUsage > this.config.maxTokens * this.config.compressionThreshold
    );
  }
}

/**
 * Detect if an error is a token limit exceeded error
 */
export function isTokenLimitExceededError(
  error: unknown,
): error is TokenLimitError {
  if (typeof error === 'string') {
    return (
      error.includes('exceeds the maximum number of tokens allowed') ||
      (error.includes('INVALID_ARGUMENT') && error.includes('token count'))
    );
  }

  if (error && typeof error === 'object') {
    const errorObj = error as unknown as { error?: { message?: string } };
    if (errorObj.error?.message) {
      return errorObj.error.message.includes(
        'exceeds the maximum number of tokens allowed',
      );
    }
  }

  return false;
}

/**
 * Extract token count information from error message
 */
export function extractTokenInfo(
  error: string,
): { current: number; max: number } | null {
  const tokenCountMatch = error.match(
    /token count \((\d+)\) exceeds the maximum number of tokens allowed \((\d+)\)/,
  );
  if (tokenCountMatch) {
    return {
      current: parseInt(tokenCountMatch[1], 10),
      max: parseInt(tokenCountMatch[2], 10),
    };
  }
  return null;
}

/**
 * Generate user-friendly token limit error message
 */
export function getTokenLimitErrorMessage(
  error: TokenLimitError,
  authType?: AuthType,
  userTier?: UserTierId,
  currentModel?: string,
  fallbackModel?: string,
): string {
  const { currentTokens, maxTokens } = error;
  const usagePercent = Math.round((currentTokens / maxTokens) * 100);

  let baseMessage = `⚠️  Input is too long to process.\n`;
  baseMessage += `📊 Tokens used: ${currentTokens.toLocaleString()} / ${maxTokens.toLocaleString()} (${usagePercent}%)\n`;

  // Add recovery suggestions based on auth type
  switch (authType) {
    case AuthType.LOGIN_WITH_GOOGLE: {
      const isPaidTier =
        userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;
      if (isPaidTier) {
        baseMessage += `🔄 Automatically switching to ${fallbackModel || DEFAULT_GEMINI_FLASH_MODEL} model and retrying.\n`;
        baseMessage += `💡 For higher token limits, try using an AI Studio API key: https://aistudio.google.com/apikey`;
      } else {
        baseMessage += `🔄 Automatically switching to ${fallbackModel || DEFAULT_GEMINI_FLASH_MODEL} model and retrying.\n`;
        baseMessage += `💡 For higher limits, upgrade your plan or use an AI Studio API key: https://aistudio.google.com/apikey`;
      }
      break;
    }
    case AuthType.USE_GEMINI:
      baseMessage += `🔄 Compressing context and retrying.\n`;
      baseMessage += `💡 For higher limits, request quota increase in AI Studio.`;
      break;
    case AuthType.USE_VERTEX_AI:
      baseMessage += `🔄 Compressing context and retrying.\n`;
      baseMessage += `💡 For higher limits, request quota increase in Vertex AI.`;
      break;
    default:
      baseMessage += `🔄 Automatically switching to ${fallbackModel || DEFAULT_GEMINI_FLASH_MODEL} model and retrying.`;
  }

  return baseMessage;
}

/**
 * Token compression strategies
 */

/**
 * Default token manager configuration
 */
export const DEFAULT_TOKEN_CONFIG: TokenManagerConfig = {
  maxTokens: 1048576, // 1M tokens
  warningThreshold: 0.8, // Warn at 80%
  compressionThreshold: 0.7, // Compress at 70%
};

/**
 * Estimate token count for content (rough estimation)
 * This is a shared utility function to avoid duplication across modules.
 *
 * @param content Array of Content objects to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokenCount(content: Content[]): number {
  let totalTokens = 0;

  for (const msg of content) {
    for (const part of msg.parts) {
      if (part.text) {
        // Rough estimation: ~4 characters per token
        totalTokens += Math.ceil(part.text.length / 4);
      }
    }
  }

  return totalTokens;
}
