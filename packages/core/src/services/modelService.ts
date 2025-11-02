/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { loadApiKey } from '../core/apiKeyCredentialStorage.js';

export interface ModelInfo {
  value: string;
  title: string;
  description: string;
  key: string;
}

interface ApiModel {
  name: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

interface ModelsResponse {
  models: ApiModel[];
}

/**
 * Service for fetching and managing available models
 */
export class ModelService {
  /**
   * Fetches all available models from the Google Generative Language API
   * @param config The configuration instance containing API key
   * @returns Array of model information
   */
  static async fetchAvailableModels(config: Config): Promise<ModelInfo[]> {
    try {
      // Get the API key from config or environment
      const contentGeneratorConfig = config.getContentGeneratorConfig();
      let apiKey = contentGeneratorConfig?.apiKey;

      if (!apiKey) {
        // Try to load from storage or environment
        apiKey =
          (await loadApiKey()) || process.env['GEMINI_API_KEY'] || undefined;
      }

      if (!apiKey) {
        console.warn('No API key available to fetch models');
        return [];
      }

      // Fetch models directly from the REST API
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = (await response.json()) as ModelsResponse;

      if (!data.models || !Array.isArray(data.models)) {
        return [];
      }

      // Filter and map to ModelInfo format
      return data.models
        .filter((model) => {
          const name = model.name || '';
          const displayName = model.displayName || '';
          // Filter out non-generative models
          return (
            !name.includes('embedding') &&
            !name.includes('aqa') &&
            !displayName.toLowerCase().includes('embedding') &&
            (model.supportedGenerationMethods?.includes('generateContent') ??
              true)
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
    } catch (error) {
      console.error('Failed to fetch models:', error);
      // Return empty array on error to allow graceful degradation
      return [];
    }
  }
}
