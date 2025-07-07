/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
} from '@google/genai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { TrustNodeLlamaClient } from './nodeLlamaClient.js';
import { TrustModelManagerImpl } from './modelManager.js';
import { TrustModelConfig, GenerationOptions } from './types.js';

export class TrustContentGenerator implements ContentGenerator {
  private modelClient: TrustNodeLlamaClient;
  private modelManager: TrustModelManagerImpl;
  private isInitialized = false;

  constructor(modelsDir?: string) {
    this.modelClient = new TrustNodeLlamaClient();
    this.modelManager = new TrustModelManagerImpl(modelsDir);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.modelManager.initialize();
    
    // Load default model if available
    const currentModel = this.modelManager.getCurrentModel();
    if (currentModel) {
      try {
        await this.modelClient.loadModel(currentModel.path, currentModel);
        console.log(`Loaded default model: ${currentModel.name}`);
      } catch (error) {
        console.warn(`Failed to load default model ${currentModel.name}:`, error);
        // Try to load a recommended model
        const recommended = this.modelManager.getRecommendedModel('default');
        if (recommended) {
          try {
            await this.modelClient.loadModel(recommended.path, recommended);
            await this.modelManager.switchModel(recommended.name);
            console.log(`Loaded recommended model: ${recommended.name}`);
          } catch (error2) {
            console.error('Failed to load any model:', error2);
          }
        }
      }
    }

    this.isInitialized = true;
  }

  async generateContent(request: GenerateContentParameters): Promise<GenerateContentResponse> {
    await this.initialize();

    if (!this.modelClient.isModelLoaded()) {
      throw new Error('No model loaded. Please load a model first.');
    }

    try {
      // Convert Gemini request format to simple text prompt
      const prompt = this.convertRequestToPrompt(request);
      
      // Get generation options from request config
      const options: GenerationOptions = {
        temperature: request.config?.temperature || 0.7,
        topP: request.config?.topP || 0.9,
        maxTokens: 2048, // Default maxTokens since it's not in GenerateContentConfig
      };

      // Generate response using local model
      const response = await this.modelClient.generateText(prompt, options);

      // Convert to Gemini response format
      return this.convertToGeminiResponse(response);

    } catch (error) {
      console.error('Error in generateContent:', error);
      throw new Error(`Local model generation failed: ${error}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    await this.initialize();

    if (!this.modelClient.isModelLoaded()) {
      throw new Error('No model loaded. Please load a model first.');
    }

    const prompt = this.convertRequestToPrompt(request);
    const options: GenerationOptions = {
      temperature: request.config?.temperature || 0.7,
      topP: request.config?.topP || 0.9,
      maxTokens: 2048, // Default maxTokens
    };

    return this.generateStreamingResponse(prompt, options);
  }

  private async* generateStreamingResponse(
    prompt: string, 
    options: GenerationOptions
  ): AsyncGenerator<GenerateContentResponse> {
    try {
      for await (const chunk of this.modelClient.generateStream(prompt, options)) {
        yield this.convertToGeminiResponse(chunk);
      }
    } catch (error) {
      console.error('Error in generateContentStream:', error);
      throw new Error(`Local model streaming failed: ${error}`);
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Simple token counting estimation
    // In a real implementation, this would use the model's tokenizer
    const prompt = this.convertRequestToPrompt(request);
    const estimatedTokens = Math.ceil(prompt.length / 4); // Rough estimation

    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Local embedding models would be implemented here
    // For now, return empty response
    throw new Error('Local embedding models not yet implemented');
  }

  // Helper methods for format conversion
  private convertRequestToPrompt(request: GenerateContentParameters | CountTokensParameters): string {
    if (!request.contents) {
      return '';
    }

    // Handle both array and single content
    const contentsArray = Array.isArray(request.contents) ? request.contents : [request.contents];
    
    if (contentsArray.length === 0) {
      return '';
    }

    let prompt = '';
    
    // Add system instruction if present
    if ('config' in request && request.config?.systemInstruction) {
      if (typeof request.config.systemInstruction === 'object' && 'parts' in request.config.systemInstruction) {
        const systemText = this.extractTextFromParts(request.config.systemInstruction.parts);
        if (systemText) {
          prompt += `System: ${systemText}\n\n`;
        }
      }
    }

    // Convert conversation history
    for (const content of contentsArray) {
      if (typeof content === 'object' && content !== null && 'parts' in content) {
        const text = this.extractTextFromParts(content.parts);
        if (text) {
          const role = content.role === 'model' ? 'Assistant' : 'User';
          prompt += `${role}: ${text}\n\n`;
        }
      }
    }

    return prompt.trim();
  }

  private extractTextFromParts(parts: Part[] | Part | undefined): string {
    if (!parts) return '';
    
    const partsArray = Array.isArray(parts) ? parts : [parts];
    
    return partsArray
      .map(part => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null) {
          if ('text' in part && part.text) return part.text;
          if ('functionCall' in part && part.functionCall) return `[Function call: ${part.functionCall.name}]`;
          if ('functionResponse' in part && part.functionResponse) return `[Function response: ${part.functionResponse.name}]`;
        }
        return '';
      })
      .join(' ')
      .trim();
  }

  private convertToGeminiResponse(text: string): GenerateContentResponse {
    return {
      candidates: [
        {
          content: {
            parts: [{ text }],
            role: 'model',
          },
          finishReason: 'STOP' as any,
          index: 0,
        },
      ],
      text: text,
      data: undefined,
      functionCalls: [],
      executableCode: undefined,
      codeExecutionResult: undefined,
    } as unknown as GenerateContentResponse;
  }

  // Model management methods
  async switchModel(modelName: string): Promise<void> {
    await this.modelManager.switchModel(modelName);
    const newModel = this.modelManager.getCurrentModel();
    if (newModel) {
      await this.modelClient.loadModel(newModel.path, newModel);
    }
  }

  async downloadModel(modelId: string): Promise<void> {
    await this.modelManager.downloadModel(modelId);
  }

  listAvailableModels(): TrustModelConfig[] {
    return this.modelManager.listAvailableModels();
  }

  getCurrentModel(): TrustModelConfig | null {
    return this.modelManager.getCurrentModel();
  }

  getModelMetrics() {
    return this.modelClient.getMetrics();
  }

  getRecommendedModel(task: string, ramLimit?: number): TrustModelConfig | null {
    return this.modelManager.getRecommendedModel(task, ramLimit);
  }
}