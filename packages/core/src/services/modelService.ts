/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Model } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { LoggingContentGenerator } from '../core/loggingContentGenerator.js';

export interface ModelInfo {
  value: string;
  title: string;
  description: string;
  key: string;
}

/**
 * Service for fetching and managing available models
 */
export class ModelService {
  /**
   * Fetches all available models from the API
   * @param contentGenerator The content generator instance
   * @returns Array of model information
   */
  static async fetchAvailableModels(
    contentGenerator: ContentGenerator,
  ): Promise<ModelInfo[]> {
    try {
      // Unwrap the logging decorator to access the underlying models API
      let generator = contentGenerator;
      if (generator instanceof LoggingContentGenerator) {
        generator = generator.getWrapped();
      }

      // Check if the generator has a list method (it should be a Models instance)
      if ('list' in generator && typeof generator.list === 'function') {
        const pager = await generator.list();
        const models: Model[] = [];

        // Iterate through all pages
        for await (const model of pager) {
          models.push(model);
        }

        // Filter to only include generative models (excluding embeddings, etc.)
        // and map to ModelInfo format
        return models
          .filter((model) => {
            const name = model.name || '';
            const displayName = model.displayName || '';
            // Filter out non-generative models
            return (
              !name.includes('embedding') &&
              !name.includes('aqa') &&
              !displayName.toLowerCase().includes('embedding') &&
              (model.supportedActions?.includes('generateContent') ?? true)
            );
          })
          .map((model) => {
            const name = model.name || '';
            // Extract the model ID from the full name (e.g., "models/gemini-2.5-pro" -> "gemini-2.5-pro")
            const modelId = name.includes('/') ? name.split('/').pop()! : name;

            return {
              value: modelId,
              title: model.displayName || modelId,
              description: model.description || 'Gemini model',
              key: modelId,
            };
          })
          .sort((a, b) => {
            // Sort by name, putting "pro" models first, then "flash", then others
            const orderA = a.value.includes('pro')
              ? 0
              : a.value.includes('flash')
                ? 1
                : 2;
            const orderB = b.value.includes('pro')
              ? 0
              : b.value.includes('flash')
                ? 1
                : 2;
            if (orderA !== orderB) {
              return orderA - orderB;
            }
            return a.value.localeCompare(b.value);
          });
      }

      // Fallback to empty array if list method is not available
      return [];
    } catch (error) {
      console.error('Failed to fetch models:', error);
      // Return empty array on error to allow graceful degradation
      return [];
    }
  }
}
