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
  FunctionCall,
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
      
      console.log('DEBUG: Generated prompt length:', prompt.length);
      console.log('DEBUG: Has tools:', 'config' in request && request.config?.tools && request.config.tools.length > 0);
      
      // Get generation options from request config
      const options: GenerationOptions = {
        temperature: request.config?.temperature || 0.7,
        topP: request.config?.topP || 0.9,
        maxTokens: 512, // Reduced maxTokens for faster responses
      };

      console.log('DEBUG: Starting text generation...');
      // Generate response using local model
      const response = await this.modelClient.generateText(prompt, options);
      console.log('DEBUG: Generated response length:', response.length);

      // Convert to Gemini response format
      console.log('DEBUG: Converting to Gemini response...');
      const geminiResponse = this.convertToGeminiResponse(response);
      console.log('DEBUG: Found function calls:', geminiResponse.functionCalls?.length || 0);
      return geminiResponse;

    } catch (error) {
      console.error('Error in generateContent:', error);
      throw new Error(`Local model generation failed: ${error}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    console.log('DEBUG: TrustContentGenerator.generateContentStream called');
    await this.initialize();

    if (!this.modelClient.isModelLoaded()) {
      throw new Error('No model loaded. Please load a model first.');
    }

    const prompt = this.convertRequestToPrompt(request);
    console.log('DEBUG: Generated prompt for streaming length:', prompt.length);
    console.log('DEBUG: Prompt preview (first 500 chars):', prompt.substring(0, 500));
    const options: GenerationOptions = {
      temperature: request.config?.temperature || 0.7,
      topP: request.config?.topP || 0.9,
      maxTokens: 512, // Reduced maxTokens for faster responses
    };

    console.log('DEBUG: About to start streaming generation...');
    return this.generateStreamingResponse(prompt, options);
  }

  private async* generateStreamingResponse(
    prompt: string, 
    options: GenerationOptions
  ): AsyncGenerator<GenerateContentResponse> {
    console.log('DEBUG: Starting generateStreamingResponse...');
    try {
      console.log('DEBUG: About to call modelClient.generateStream...');
      for await (const chunk of this.modelClient.generateStream(prompt, options)) {
        console.log('DEBUG: Got chunk from model client:', chunk.substring(0, 50));
        console.log('DEBUG: Full chunk length:', chunk.length);
        const geminiResponse = this.convertToGeminiResponse(chunk);
        console.log('DEBUG: Yielding response with function calls:', geminiResponse.functionCalls?.length || 0);
        yield geminiResponse;
      }
      console.log('DEBUG: Finished streaming generation');
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
          prompt += `${systemText}\n\n`;
        }
      }
    }

    // Add available tools information if tools are present
    if ('config' in request && request.config?.tools && request.config.tools.length > 0) {
      prompt += `\nTOOLS: Call functions using JSON format {"function_call": {"name": "NAME", "arguments": {...}}}.\n`;
      
      const toolNames: string[] = [];
      for (const tool of request.config.tools) {
        if (tool && typeof tool === 'object' && 'functionDeclarations' in tool && tool.functionDeclarations) {
          for (const func of tool.functionDeclarations) {
            if (func.name) {
              toolNames.push(func.name);
            }
          }
        }
      }
      
      prompt += `Available: ${toolNames.join(', ')}\nUse tools directly, not instructions.\n\n`;
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

  private parseFunctionCalls(text: string): { text: string; functionCalls: FunctionCall[] } {
    const functionCalls: FunctionCall[] = [];
    let cleanedText = text;

    console.log('DEBUG: Parsing function calls from text (first 200 chars):', text.substring(0, 200));
    console.log('DEBUG: Full text being parsed:', text);

    // Look for JSON function call patterns - updated to handle nested objects and multiline formatting
    // Support both ```json and ```bash blocks since models sometimes use different blocks
    const functionCallRegex = /```(?:json|bash)\s*\n([\s\S]*?)\n\s*```/gs;
    let match;
    
    while ((match = functionCallRegex.exec(text)) !== null) {
      try {
        const jsonMatch = match[1].trim();
        console.log('DEBUG: Found JSON match:', jsonMatch);
        // Only process if it contains function_call
        if (jsonMatch.includes('function_call')) {
          const parsed = JSON.parse(jsonMatch);
          
          if (parsed.function_call && parsed.function_call.name) {
            const functionCall: FunctionCall = {
              name: parsed.function_call.name,
              args: parsed.function_call.arguments || {},
              id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            };
            functionCalls.push(functionCall);
            
            // Remove the function call from the text
            cleanedText = cleanedText.replace(match[0], '').trim();
          }
        }
      } catch (error) {
        console.warn('Failed to parse function call JSON:', error);
      }
    }

    // Also look for simpler patterns without code blocks
    const simpleFunctionCallRegex = /{"function_call":\s*{"name":\s*"[^"]+",\s*"arguments":\s*{.*?}}}/gs;
    
    while ((match = simpleFunctionCallRegex.exec(cleanedText)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        
        if (parsed.function_call && parsed.function_call.name) {
          const functionCall: FunctionCall = {
            name: parsed.function_call.name,
            args: parsed.function_call.arguments || {},
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          };
          functionCalls.push(functionCall);
          
          // Remove the function call from the text
          cleanedText = cleanedText.replace(match[0], '').trim();
        }
      } catch (error) {
        console.warn('Failed to parse simple function call JSON:', error);
      }
    }

    return { text: cleanedText, functionCalls };
  }

  private convertToGeminiResponse(text: string): GenerateContentResponse {
    console.log('DEBUG: Converting to Gemini response, text length:', text.length);
    const { text: cleanedText, functionCalls } = this.parseFunctionCalls(text);
    
    const response: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: cleanedText }],
            role: 'model',
          },
          finishReason: 'STOP' as any,
          index: 0,
        },
      ],
      text: cleanedText,
      data: undefined,
      functionCalls: functionCalls,
      executableCode: undefined,
      codeExecutionResult: undefined,
    } as unknown as GenerateContentResponse;

    // If we found function calls, we need to add them to the response parts
    if (functionCalls.length > 0) {
      const parts: Part[] = [];
      
      // Add text part if there's any text content
      if (cleanedText.trim()) {
        parts.push({ text: cleanedText });
      }
      
      // Add function call parts
      for (const call of functionCalls) {
        parts.push({ functionCall: call });
      }
      
      // Update the candidate content parts
      if (response.candidates && response.candidates[0] && response.candidates[0].content) {
        response.candidates[0].content.parts = parts;
      }
    }

    return response;
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