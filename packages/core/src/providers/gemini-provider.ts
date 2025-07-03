// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import {
  GoogleGenAI,
  Content,
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  createUserContent,
} from '@google/genai';
import { 
  IModelProvider, 
  Model, 
  ChatRequest, 
  ChatResponse, 
  ChatResponseChunk,
  ProviderConfig 
} from './types.js';
import { DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { AuthType } from '../core/contentGenerator.js';
import { getEffectiveModel } from '../core/modelCheck.js';

/**
 * Provider implementation for Google Gemini API
 */
export class GeminiProvider implements IModelProvider {
  private googleGenAI: GoogleGenAI | null = null;
  private initialized: boolean = false;
  private apiKey?: string;
  private model: string = DEFAULT_GEMINI_MODEL;
  private authType: AuthType = AuthType.USE_GEMINI;
  private vertexai: boolean = false;

  async initialize(config?: ProviderConfig): Promise<void> {
    // Check for API key in config or environment
    this.apiKey = config?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    if (config?.authType) {
      this.authType = config.authType as AuthType;
    }

    // Check if we're using Vertex AI
    if (config?.vertexai || (this.authType === AuthType.USE_VERTEX_AI)) {
      const project = process.env.GOOGLE_CLOUD_PROJECT;
      const location = process.env.GOOGLE_CLOUD_LOCATION;
      
      if (!project || !location) {
        throw new Error('GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION must be set for Vertex AI');
      }
      
      this.vertexai = true;
    }

    // Validate authentication
    if (this.authType === AuthType.USE_GEMINI && !this.apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required for Gemini authentication');
    }

    if (this.authType === AuthType.USE_VERTEX_AI && !this.apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is required for Vertex AI authentication');
    }

    // Set model
    if (config?.model) {
      this.model = config.model;
    }

    // Get effective model based on authentication
    if (this.apiKey) {
      this.model = await getEffectiveModel(this.apiKey, this.model);
    }

    // Initialize Google GenAI client
    const version = process.env.CLI_VERSION || process.version;
    const httpOptions = {
      headers: {
        'User-Agent': `GeminiCopilot/${version} (${process.platform}; ${process.arch})`,
      },
    };

    this.googleGenAI = new GoogleGenAI({
      apiKey: this.apiKey === '' ? undefined : this.apiKey,
      vertexai: this.vertexai,
      httpOptions,
    });

    this.initialized = true;
  }

  async listModels(): Promise<Model[]> {
    if (!this.initialized) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    // Gemini doesn't have a list models API, so we return known models
    const models: Model[] = [
      {
        id: DEFAULT_GEMINI_MODEL,
        name: 'Gemini 2.5 Pro',
        vendor: 'google',
        family: 'gemini',
        version: '2.5',
        maxInputTokens: 2097152,
        maxOutputTokens: 8192,
      },
      {
        id: DEFAULT_GEMINI_FLASH_MODEL,
        name: 'Gemini 2.5 Flash',
        vendor: 'google',
        family: 'gemini',
        version: '2.5-flash',
        maxInputTokens: 1048576,
        maxOutputTokens: 8192,
      }
    ];

    return models;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.initialized || !this.googleGenAI) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    try {
      // Convert chat messages to Gemini format
      const contents = this.convertMessagesToGeminiFormat(request.messages);

      // Prepare request parameters
      const params: GenerateContentParameters = {
        contents,
        model: request.model || this.model,
        config: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
        }
      };

      // Make the request
      const response = await this.googleGenAI.models.generateContent(params);

      // Convert response to our format
      return this.convertGeminiResponseToChat(response);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Gemini API error: ${error.message}`);
      }
      throw error;
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatResponseChunk> {
    if (!this.initialized || !this.googleGenAI) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    try {
      // Convert chat messages to Gemini format
      const contents = this.convertMessagesToGeminiFormat(request.messages);

      // Prepare request parameters
      const params: GenerateContentParameters = {
        contents,
        model: request.model || this.model,
        config: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
        }
      };

      // Make the streaming request
      const responseStream = await this.googleGenAI.models.generateContentStream(params);

      // Stream the responses
      for await (const response of responseStream) {
        yield this.convertGeminiResponseToChunk(response);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Gemini API streaming error: ${error.message}`);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.initialized || !this.googleGenAI) {
      return false;
    }

    try {
      // Try to count tokens for a simple message
      const response = await this.googleGenAI.models.countTokens({
        contents: [createUserContent('Hello')],
        model: this.model
      });

      return response.totalTokens !== undefined;
    } catch (error) {
      return false;
    }
  }

  getName(): string {
    if (this.authType === AuthType.USE_VERTEX_AI) {
      return 'Google Vertex AI';
    }
    return 'Google Gemini API';
  }

  async dispose(): Promise<void> {
    this.initialized = false;
    this.googleGenAI = null;
  }

  /**
   * Convert chat messages to Gemini content format
   */
  private convertMessagesToGeminiFormat(messages: ChatRequest['messages']): Content[] {
    const contents: Content[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        // Gemini doesn't have a system role, so we prepend it to the first user message
        if (contents.length === 0 || contents[0].role !== 'user') {
          contents.unshift({
            role: 'user',
            parts: [{ text: `System: ${message.content}` }]
          });
        } else {
          // Prepend to existing first user message
          const firstUserContent = contents[0];
          if (firstUserContent.parts && firstUserContent.parts[0]) {
            firstUserContent.parts[0] = { 
              text: `System: ${message.content}\n\n${(firstUserContent.parts[0] as any).text}` 
            };
          }
        }
      } else if (message.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: message.content }]
        });
      } else if (message.role === 'assistant') {
        contents.push({
          role: 'model',
          parts: [{ text: message.content }]
        });
      }
    }

    return contents;
  }

  /**
   * Convert Gemini response to chat response format
   */
  private convertGeminiResponseToChat(response: GenerateContentResponse): ChatResponse {
    const candidate = response.candidates?.[0];
    if (!candidate || !candidate.content) {
      throw new Error('No valid response from Gemini');
    }

    const text = candidate.content.parts
      ? candidate.content.parts.map(part => (part as any).text || '').join('')
      : '';

    return {
      id: response.modelVersion || 'gemini-response',
      choices: [{
        message: {
          content: text,
          role: 'assistant'
        },
        index: 0,
        finishReason: candidate.finishReason || 'stop'
      }],
      model: this.model,
      created: Date.now(),
      usage: response.usageMetadata ? {
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        completionTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0
      } : undefined
    };
  }

  /**
   * Convert Gemini streaming response to chat response chunk
   */
  private convertGeminiResponseToChunk(response: GenerateContentResponse): ChatResponseChunk {
    const candidate = response.candidates?.[0];
    let text = '';
    
    if (candidate?.content) {
      text = candidate.content.parts
        ? candidate.content.parts.map(part => (part as any).text || '').join('')
        : '';
    }

    return {
      id: response.modelVersion || 'gemini-stream',
      choices: [{
        delta: {
          content: text,
          role: text ? 'assistant' : undefined
        },
        index: 0,
        finishReason: candidate?.finishReason
      }],
      model: this.model,
      created: Date.now()
    };
  }
}