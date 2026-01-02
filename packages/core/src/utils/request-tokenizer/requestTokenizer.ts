/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensParameters,
  Content,
  Part,
  PartUnion,
} from '@google/genai';
import type {
  RequestTokenizer,
  TokenizerConfig,
  TokenCalculationResult,
} from './types.js';
import { TextTokenizer } from './textTokenizer.js';
import { ImageTokenizer } from './imageTokenizer.js';

/**
 * Default request tokenizer that handles text and image content
 *
 * Key features:
 * - Local token calculation without API calls
 * - Accurate image token estimation based on dimensions (28x28 pixels = 1 token)
 * - Fixes false "context window exceeded" warnings for large PDFs/images
 */
export class DefaultRequestTokenizer implements RequestTokenizer {
  private textTokenizer: TextTokenizer;
  private imageTokenizer: ImageTokenizer;

  constructor() {
    this.textTokenizer = new TextTokenizer();
    this.imageTokenizer = new ImageTokenizer();
  }

  /**
   * Calculate tokens for a request using local processing
   */
  async calculateTokens(
    request: CountTokensParameters,
    config: TokenizerConfig = {},
  ): Promise<TokenCalculationResult> {
    const startTime = performance.now();

    // Apply configuration
    if (config.textEncoding) {
      this.textTokenizer = new TextTokenizer(config.textEncoding);
    }

    try {
      // Process request content and group by type
      const { textContents, imageContents, audioContents, otherContents } =
        this.processAndGroupContents(request);

      if (
        textContents.length === 0 &&
        imageContents.length === 0 &&
        audioContents.length === 0 &&
        otherContents.length === 0
      ) {
        return {
          totalTokens: 0,
          breakdown: {
            textTokens: 0,
            imageTokens: 0,
            audioTokens: 0,
            otherTokens: 0,
          },
          processingTime: performance.now() - startTime,
        };
      }

      // Calculate tokens for each content type
      const textTokens = await this.calculateTextTokens(textContents);
      const imageTokens = await this.calculateImageTokens(imageContents);
      const audioTokens = await this.calculateAudioTokens(audioContents);
      const otherTokens = await this.calculateOtherTokens(otherContents);

      const totalTokens = textTokens + imageTokens + audioTokens + otherTokens;
      const processingTime = performance.now() - startTime;

      return {
        totalTokens,
        breakdown: {
          textTokens,
          imageTokens,
          audioTokens,
          otherTokens,
        },
        processingTime,
      };
    } catch (error) {
      console.error('Error calculating tokens:', error);

      // Fallback calculation
      const fallbackTokens = this.calculateFallbackTokens(request);

      return {
        totalTokens: fallbackTokens,
        breakdown: {
          textTokens: fallbackTokens,
          imageTokens: 0,
          audioTokens: 0,
          otherTokens: 0,
        },
        processingTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Calculate tokens for text contents
   */
  private async calculateTextTokens(textContents: string[]): Promise<number> {
    if (textContents.length === 0) return 0;

    try {
      const tokenCounts =
        await this.textTokenizer.calculateTokensBatch(textContents);
      return tokenCounts.reduce((sum, count) => sum + count, 0);
    } catch (error) {
      console.warn('Error calculating text tokens:', error);
      // Fallback: character-based estimation
      const totalChars = textContents.join('').length;
      return Math.ceil(totalChars / 4);
    }
  }

  /**
   * Calculate tokens for image contents using dimension-based calculation
   *
   * This is the key fix for the "context window exceeded" issue:
   * - Previous approach: base64 length / 4 = ~3.5M tokens for 10MB PDF
   * - New approach: dimension-based = max 16,386 tokens per image
   */
  private async calculateImageTokens(
    imageContents: Array<{ data: string; mimeType: string }>,
  ): Promise<number> {
    if (imageContents.length === 0) return 0;

    try {
      const tokenCounts =
        await this.imageTokenizer.calculateTokensBatch(imageContents);
      return tokenCounts.reduce((sum, count) => sum + count, 0);
    } catch (error) {
      console.warn('Error calculating image tokens:', error);
      // Fallback: minimum tokens per image
      return imageContents.length * 6; // 4 image tokens + 2 special tokens as minimum
    }
  }

  /**
   * Calculate tokens for audio contents
   */
  private async calculateAudioTokens(
    audioContents: Array<{ data: string; mimeType: string }>,
  ): Promise<number> {
    if (audioContents.length === 0) return 0;

    // Estimate based on data size
    let totalTokens = 0;

    for (const audioContent of audioContents) {
      try {
        const dataSize = Math.floor(audioContent.data.length * 0.75); // Approximate binary size
        // Rough estimate: 1 token per 100 bytes of audio data
        totalTokens += Math.max(Math.ceil(dataSize / 100), 10); // Minimum 10 tokens per audio
      } catch (error) {
        console.warn('Error calculating audio tokens:', error);
        totalTokens += 10; // Fallback minimum
      }
    }

    return totalTokens;
  }

  /**
   * Calculate tokens for other content types (functions, files, etc.)
   */
  private async calculateOtherTokens(otherContents: string[]): Promise<number> {
    if (otherContents.length === 0) return 0;

    try {
      // Treat other content as text for token calculation
      const tokenCounts =
        await this.textTokenizer.calculateTokensBatch(otherContents);
      return tokenCounts.reduce((sum, count) => sum + count, 0);
    } catch (error) {
      console.warn('Error calculating other content tokens:', error);
      // Fallback: character-based estimation
      const totalChars = otherContents.join('').length;
      return Math.ceil(totalChars / 4);
    }
  }

  /**
   * Fallback token calculation using simple string serialization
   */
  private calculateFallbackTokens(request: CountTokensParameters): number {
    try {
      const content = JSON.stringify(request.contents);
      return Math.ceil(content.length / 4); // Rough estimate: 1 token ≈ 4 characters
    } catch (error) {
      console.warn('Error in fallback token calculation:', error);
      return 100; // Conservative fallback
    }
  }

  /**
   * Process request contents and group by type
   */
  private processAndGroupContents(request: CountTokensParameters): {
    textContents: string[];
    imageContents: Array<{ data: string; mimeType: string }>;
    audioContents: Array<{ data: string; mimeType: string }>;
    otherContents: string[];
  } {
    const textContents: string[] = [];
    const imageContents: Array<{ data: string; mimeType: string }> = [];
    const audioContents: Array<{ data: string; mimeType: string }> = [];
    const otherContents: string[] = [];

    if (!request.contents) {
      return { textContents, imageContents, audioContents, otherContents };
    }

    const contents = Array.isArray(request.contents)
      ? request.contents
      : [request.contents];

    for (const content of contents) {
      this.processContent(
        content,
        textContents,
        imageContents,
        audioContents,
        otherContents,
      );
    }

    return { textContents, imageContents, audioContents, otherContents };
  }

  /**
   * Process a single content item and add to appropriate arrays
   */
  private processContent(
    content: Content | string | PartUnion,
    textContents: string[],
    imageContents: Array<{ data: string; mimeType: string }>,
    audioContents: Array<{ data: string; mimeType: string }>,
    otherContents: string[],
  ): void {
    if (typeof content === 'string') {
      if (content.trim()) {
        textContents.push(content);
      }
      return;
    }

    if ('parts' in content && content.parts) {
      for (const part of content.parts) {
        this.processPart(
          part,
          textContents,
          imageContents,
          audioContents,
          otherContents,
        );
      }
    }
  }

  /**
   * Process a single part and add to appropriate arrays
   */
  private processPart(
    part: Part | string,
    textContents: string[],
    imageContents: Array<{ data: string; mimeType: string }>,
    audioContents: Array<{ data: string; mimeType: string }>,
    otherContents: string[],
  ): void {
    if (typeof part === 'string') {
      if (part.trim()) {
        textContents.push(part);
      }
      return;
    }

    if ('text' in part && part.text) {
      textContents.push(part.text);
      return;
    }

    if ('inlineData' in part && part.inlineData) {
      const { data, mimeType } = part.inlineData;
      if (mimeType && mimeType.startsWith('image/')) {
        imageContents.push({ data: data || '', mimeType });
        return;
      }
      if (mimeType && mimeType.startsWith('audio/')) {
        audioContents.push({ data: data || '', mimeType });
        return;
      }
      // For PDFs and other inline data, treat as image for token calculation
      // This ensures PDFs get proper dimension-based token estimation
      if (mimeType && mimeType === 'application/pdf') {
        // PDF pages are converted to images, estimate based on typical page dimensions
        // Assume 1 page at 1024x1024 as a reasonable default
        imageContents.push({ data: data || '', mimeType: 'image/png' });
        return;
      }
    }

    if ('fileData' in part && part.fileData) {
      otherContents.push(JSON.stringify(part.fileData));
      return;
    }

    if ('functionCall' in part && part.functionCall) {
      otherContents.push(JSON.stringify(part.functionCall));
      return;
    }

    if ('functionResponse' in part && part.functionResponse) {
      otherContents.push(JSON.stringify(part.functionResponse));
      return;
    }

    // Unknown part type - try to serialize
    try {
      const serialized = JSON.stringify(part);
      if (serialized && serialized !== '{}') {
        otherContents.push(serialized);
      }
    } catch (error) {
      console.warn('Failed to serialize unknown part type:', error);
    }
  }

  /**
   * Dispose of resources
   */
  async dispose(): Promise<void> {
    try {
      this.textTokenizer.dispose();
    } catch (error) {
      console.warn('Error disposing request tokenizer:', error);
    }
  }
}
