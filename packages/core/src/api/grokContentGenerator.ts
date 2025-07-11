import {
  ContentGenerator,
  ContentGeneratorConfig,
} from '../core/contentGenerator.js';
import {
  GenerateContentResponse,
  CountTokensResponse,
  EmbedContentResponse,
  Content,
  Part,
  FinishReason,
} from '@google/genai';
import { GrokClient, GrokMessage } from './grokClient.js';

interface GenerateContentRequest {
  contents: Content[];
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
  };
}

interface CountTokensRequest {
  contents: Content[];
}

interface EmbedContentRequest {
  content: Content;
  model?: string;
}

export class GrokContentGenerator implements ContentGenerator {
  private grokClient: GrokClient;
  private model: string;

  constructor(config: ContentGeneratorConfig) {
    this.grokClient = new GrokClient({ grokApiKey: config.apiKey });
    this.model = config.model;
  }

  private convertToGrokMessages(contents: Content[]): GrokMessage[] {
    const messages: GrokMessage[] = [];
    
    for (const content of contents) {
      const role = content.role === 'model' ? 'assistant' : content.role as 'system' | 'user';
      
      if (content.parts) {
        const textParts = content.parts.filter((part: any): part is Part & { text: string } => 'text' in part);
        
        if (textParts.length > 0) {
          const combinedText = textParts.map(part => part.text).join('\n');
          messages.push({
            role,
            content: combinedText,
          });
        }
      }
    }
    
    return messages;
  }

  async generateContent(
    request: any,
  ): Promise<GenerateContentResponse> {
    const messages = this.convertToGrokMessages(request.contents);
    
    const grokResponse = await this.grokClient.createChatCompletion({
      model: this.model,
      messages,
      max_tokens: request.generationConfig?.maxOutputTokens,
      temperature: request.generationConfig?.temperature,
      top_p: request.generationConfig?.topP,
      stream: false,
    });

    // Convert Grok response to Gemini response format
    const response = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{
            text: grokResponse.choices[0].message.content,
          }],
        },
        finishReason: grokResponse.choices[0].finish_reason as FinishReason,
        index: 0,
        safetyRatings: [],
      }],
      usageMetadata: {
        promptTokenCount: grokResponse.usage.prompt_tokens,
        candidatesTokenCount: grokResponse.usage.completion_tokens,
        totalTokenCount: grokResponse.usage.total_tokens,
      },
    } as unknown as GenerateContentResponse;

    return response;
  }

  async generateContentStream(
    request: any,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const messages = this.convertToGrokMessages(request.contents);
    
    const self = this;
    
    async function* generator(): AsyncGenerator<GenerateContentResponse> {
      const stream = self.grokClient.createChatCompletionStream({
        model: self.model,
        messages,
        max_tokens: request.generationConfig?.maxOutputTokens,
        temperature: request.generationConfig?.temperature,
        top_p: request.generationConfig?.topP,
      });

      let accumulatedText = '';
      let promptTokens = 0;

      for await (const chunk of stream) {
        if (chunk.choices[0].delta.content) {
          accumulatedText += chunk.choices[0].delta.content;
          
          const response = {
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  text: chunk.choices[0].delta.content,
                }],
              },
              finishReason: chunk.choices[0].finish_reason as FinishReason | undefined,
              index: 0,
              safetyRatings: [],
            }],
            // Usage metadata is typically only available in the final chunk
            usageMetadata: chunk.choices[0].finish_reason ? {
              promptTokenCount: promptTokens,
              candidatesTokenCount: accumulatedText.length / 4, // Rough estimate
              totalTokenCount: promptTokens + accumulatedText.length / 4,
            } : undefined,
          } as unknown as GenerateContentResponse;
          
          yield response;
        }
      }
    }
    
    return generator();
  }

  async countTokens(request: any): Promise<CountTokensResponse> {
    // Grok doesn't have a specific token counting endpoint
    // We'll estimate based on the common approximation of 1 token ≈ 4 characters
    let totalChars = 0;
    
    for (const content of request.contents) {
      if (content.parts) {
        const textParts = content.parts.filter((part: any): part is Part & { text: string } => 'text' in part);
        for (const part of textParts) {
          totalChars += part.text.length;
        }
      }
    }
    
    const estimatedTokens = Math.ceil(totalChars / 4);
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: any): Promise<EmbedContentResponse> {
    // Grok doesn't support embeddings in the same way as Gemini
    // This would need to be implemented with a different embedding model
    throw new Error('Embeddings are not supported with Grok models. Please use a Gemini embedding model.');
  }
}