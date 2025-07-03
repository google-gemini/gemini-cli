// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import {
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  Content,
  Part,
  Candidate,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { IModelProvider, ChatMessage } from './types.js';
import { ProviderFactory, ProviderFactoryConfig } from './factory.js';

/**
 * Adapter that makes our IModelProvider work with the existing ContentGenerator interface
 */
export class ContentGeneratorAdapter implements ContentGenerator {
  private provider: IModelProvider | null = null;
  private factory: ProviderFactory;

  constructor(private config: ProviderFactoryConfig) {
    this.factory = ProviderFactory.getInstance(config);
  }

  async initialize(): Promise<void> {
    this.provider = await this.factory.getDefaultProvider();
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    // Convert Gemini format to our format
    const messages = this.convertContentsToMessages(request.contents);
    
    // Make the request
    const response = await this.provider.chat({
      messages,
      model: request.model,
      temperature: request.config?.temperature,
      maxTokens: request.config?.maxOutputTokens,
    });

    // Convert response back to Gemini format
    return this.convertToGenerateContentResponse(response);
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    // Convert Gemini format to our format
    const messages = this.convertContentsToMessages(request.contents);
    
    // Get the stream
    const stream = this.provider.chatStream({
      messages,
      model: request.model,
      temperature: request.config?.temperature,
      maxTokens: request.config?.maxOutputTokens,
    });

    // Convert and yield responses
    return this.convertStreamToGenerateContent(stream);
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // For now, we'll estimate tokens based on character count
    // This is a rough approximation - ideally each provider should implement this
    let totalChars = 0;
    
    // Handle ContentListUnion properly
    const contentArray = this.normalizeContents(request.contents);
    
    for (const content of contentArray) {
      if (!content.parts) continue;
      for (const part of content.parts) {
        if ('text' in part && part.text) {
          totalChars += part.text.length;
        }
      }
    }

    // Rough approximation: 4 characters per token
    const estimatedTokens = Math.ceil(totalChars / 4);

    return {
      totalTokens: estimatedTokens,
      cachedContentTokenCount: 0,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Embedding is not supported in our providers yet
    // This would need to be implemented per provider
    throw new Error('Embedding not supported by current provider');
  }

  private normalizeContents(contents: any): Content[] {
    // Handle ContentListUnion - normalize to Content array
    if (typeof contents === 'string') {
      return [{ role: 'user', parts: [{ text: contents }] }];
    } else if (Array.isArray(contents)) {
      if (contents.length > 0 && typeof contents[0] === 'string') {
        // Array of strings
        return [{ role: 'user', parts: contents.map(text => ({ text })) }];
      } else if (contents.length > 0 && 'text' in contents[0]) {
        // Array of Parts
        return [{ role: 'user', parts: contents }];
      } else {
        // Array of Content
        return contents;
      }
    } else if ('role' in contents) {
      // Single Content
      return [contents];
    } else if ('text' in contents) {
      // Single Part
      return [{ role: 'user', parts: [contents] }];
    }
    return [];
  }

  /**
   * Convert Gemini Content array to our ChatMessage array
   */
  private convertContentsToMessages(contents: any): ChatMessage[] {
    // Handle ContentListUnion - normalize to Content array
    let contentArray: Content[];
    
    if (typeof contents === 'string') {
      contentArray = [{ role: 'user', parts: [{ text: contents }] }];
    } else if (Array.isArray(contents)) {
      if (contents.length > 0 && typeof contents[0] === 'string') {
        // Array of strings
        contentArray = [{ role: 'user', parts: contents.map(text => ({ text })) }];
      } else if (contents.length > 0 && 'text' in contents[0]) {
        // Array of Parts
        contentArray = [{ role: 'user', parts: contents }];
      } else {
        // Array of Content
        contentArray = contents;
      }
    } else if ('role' in contents) {
      // Single Content
      contentArray = [contents];
    } else if ('text' in contents) {
      // Single Part
      contentArray = [{ role: 'user', parts: [contents] }];
    } else {
      contentArray = [];
    }

    return this.convertContentArrayToMessages(contentArray);
  }

  private convertContentArrayToMessages(contents: Content[]): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const content of contents) {
      if (!content.parts) continue;
      const text = content.parts
        .map(part => {
          if ('text' in part && part.text) {
            return part.text;
          }
          // Handle other part types as needed
          return '';
        })
        .join('');

      if (content.role === 'user') {
        messages.push({ role: 'user', content: text });
      } else if (content.role === 'model') {
        messages.push({ role: 'assistant', content: text });
      }
    }

    return messages;
  }

  /**
   * Convert our response format to Gemini's GenerateContentResponse
   */
  private convertToGenerateContentResponse(response: any): GenerateContentResponse {
    const text = response.choices[0]?.message?.content || '';
    
    console.log('🔄 Converting response to Gemini format. Text:', text);
    
    const candidate: Candidate = {
      content: {
        role: 'model',
        parts: [{ text }],
      },
      index: 0,
      finishReason: response.choices[0]?.finishReason || 'STOP',
    };

    const usageMetadata: GenerateContentResponseUsageMetadata | undefined = response.usage ? {
      promptTokenCount: response.usage.promptTokens,
      candidatesTokenCount: response.usage.completionTokens,
      totalTokenCount: response.usage.totalTokens,
      cachedContentTokenCount: 0,
    } : undefined;

    // Create a mock GenerateContentResponse with required getters
    const result = {
      candidates: [candidate],
      promptFeedback: {},
      usageMetadata,
      modelVersion: response.model,
      get text() {
        return candidate.content?.parts?.[0]?.text || '';
      },
      get data() {
        return '' as any;
      },
      get functionCalls() {
        return [];
      },
      get executableCode() {
        return '' as any;
      },
      get codeExecutionResult() {
        return undefined;
      }
    };
    
    return result as GenerateContentResponse;
  }

  /**
   * Convert streaming responses to Gemini format
   */
  private async *convertStreamToGenerateContent(
    stream: AsyncGenerator<any>
  ): AsyncGenerator<GenerateContentResponse> {
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      
      const candidate: Candidate = {
        content: {
          role: 'model',
          parts: [{ text }],
        },
        index: 0,
        finishReason: chunk.choices[0]?.finishReason,
      };

      // Create a mock GenerateContentResponse for streaming
      const result = {
        candidates: [candidate],
        promptFeedback: {},
        modelVersion: chunk.model,
        get text() {
          return candidate.content?.parts?.[0]?.text || '';
        },
        get data() {
          return '' as any;
        },
        get functionCalls() {
          return [];
        },
        get executableCode() {
          return '' as any;
        },
        get codeExecutionResult() {
          return undefined;
        }
      };
      
      yield result as GenerateContentResponse;
    }
  }

  /**
   * Get the underlying provider
   */
  getProvider(): IModelProvider | null {
    return this.provider;
  }

  /**
   * Switch to a different provider
   */
  async switchProvider(type: 'copilot' | 'gemini'): Promise<void> {
    this.provider = await this.factory.getProvider(type);
  }
}