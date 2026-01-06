/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CountTokensParameters } from '@google/genai';

/**
 * Token calculation result for different content types
 */
export interface TokenCalculationResult {
  /** Total tokens calculated */
  totalTokens: number;
  /** Breakdown by content type */
  breakdown: {
    textTokens: number;
    imageTokens: number;
    audioTokens: number;
    otherTokens: number;
  };
  /** Processing time in milliseconds */
  processingTime: number;
}

/**
 * Configuration for token calculation
 */
export interface TokenizerConfig {
  /** Custom text tokenizer encoding (defaults to cl100k_base) */
  textEncoding?: string;
}

/**
 * Image metadata extracted from base64 data
 */
export interface ImageMetadata {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** MIME type of the image */
  mimeType: string;
  /** Size of the base64 data in bytes */
  dataSize: number;
}

/**
 * Request tokenizer interface
 */
export interface RequestTokenizer {
  /**
   * Calculate tokens for a request
   */
  calculateTokens(
    request: CountTokensParameters,
    config?: TokenizerConfig,
  ): Promise<TokenCalculationResult>;

  /**
   * Dispose of resources (worker threads, etc.)
   */
  dispose(): Promise<void>;
}
