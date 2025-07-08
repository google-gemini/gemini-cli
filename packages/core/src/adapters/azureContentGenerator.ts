
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  GenerateContentParameters,
} from '@google/genai';
import { ContentGeneratorConfig } from '../core/contentGenerator.js';
import { OpenAICompatibleContentGenerator } from './openaiCompatibleContentGenerator.js';

export class AzureContentGenerator extends OpenAICompatibleContentGenerator {
  constructor(protected azureConfig: ContentGeneratorConfig) {
    super(azureConfig);
    this.azureConfig.model = this.azureConfig.model || 'gpt-4o';
  }

  /**
   * Streams content responses from Azure OpenAI API.
   */
  async generateContentStream(
    request: GenerateContentParameters
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const { openAIRequest, endpoint } = this.convertToAzureFormat(request);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.azureConfig.apiKey || '',
        ...this.azureConfig.customHeaders,
      },
      body: JSON.stringify({ ...openAIRequest, stream: true }),
      signal: this.azureConfig.timeout ? AbortSignal.timeout(this.azureConfig.timeout) : undefined,
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      throw new Error(`Azure API Streaming Error: ${response.status} - ${errorMsg}`);
    }

    if (!response.body) {
      throw new Error('Streaming response body is empty!');
    }

    // Bind "this" for class context
    const self = this;

    const generator = async function* () {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Retain unfinished line in the buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                return; // End the generator loop
              }

              try {
                const parsed = JSON.parse(data);

                // Use "self" to call the class method for processing
                const response = self.convertFromOpenAIFormat(parsed, true);
                if (response) {
                  yield response;
                }
              } catch (e) {
                console.error('Failed to parse streaming response:', e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    };

    return generator();
  }

  /**
   * Converts the `GenerateContentParameters` into Azure-specific request format.
   */
  protected convertToAzureFormat(request: GenerateContentParameters): { openAIRequest: any; endpoint: string } {
    const openAIRequest = this.convertToOpenAIFormat(request);

    // Azure-specific endpoint format
    const modelDeployment = request.model || this.azureConfig.model; // Deployment name
    const apiVersion = this.azureConfig.apiVersion || '2025-01-01-preview';
    const endpoint = `${this.azureConfig.baseUrl}/openai/deployments/${modelDeployment}/chat/completions?api-version=${apiVersion}`;

    return { openAIRequest, endpoint };
  }
}
