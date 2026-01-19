/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Adapter that bridges the ProviderManager to the existing ContentGenerator interface
 *
 * This allows the rest of the CLI to work unchanged while using multiple providers.
 */

import {
  type GenerateContentParameters,
  GenerateContentResponse,
  type CountTokensParameters,
  type CountTokensResponse,
  type EmbedContentParameters,
  type EmbedContentResponse,
  type Content,
  type Part,
  type GenerateContentConfig,
  FinishReason,
} from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { ProviderManager } from './provider-manager.js';
import type {
  ProviderMessage,
  ProviderRequest,
  ProviderResponse,
  ProviderTool,
  ProviderToolCall,
  ProviderStreamChunk,
} from './types.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Adapts ProviderManager to ContentGenerator interface
 */
export class ProviderContentGeneratorAdapter implements ContentGenerator {
  constructor(private providerManager: ProviderManager) {}

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const providerRequest = this.convertRequest(request);
    const response =
      await this.providerManager.generateContent(providerRequest);
    return this.convertResponse(response, request.model || '');
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const providerRequest = this.convertRequest(request);
    const model = request.model || '';

    const stream = this.providerManager.generateContentStream(providerRequest);
    const convertChunk = (chunk: ProviderStreamChunk) =>
      this.convertStreamChunk(chunk, model);

    // Create async generator that converts chunks
    async function* convertedStream(): AsyncGenerator<GenerateContentResponse> {
      for await (const chunk of stream) {
        yield convertChunk(chunk);
      }
    }

    return convertedStream();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Extract text content from the request
    const contents = this.normalizeContents(request.contents);
    const content = this.extractTextFromContents(contents);
    const count = await this.providerManager.countTokens(
      content,
      request.model,
    );

    return {
      totalTokens: count,
    };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Most providers don't support embeddings through this interface
    // Return a stub response
    debugLogger.warn('embedContent not supported by current provider');
    return {
      embeddings: [
        {
          values: [],
        },
      ],
    };
  }

  /**
   * Normalize ContentListUnion to Content[]
   */
  private normalizeContents(
    contents: GenerateContentParameters['contents'] | undefined,
  ): Content[] {
    if (!contents) return [];

    // Handle string case
    if (typeof contents === 'string') {
      return [{ role: 'user', parts: [{ text: contents }] }];
    }

    // Handle single Content object
    if (!Array.isArray(contents)) {
      // Single Part or Content - check if it's a Content (has role property)
      if ('role' in contents && 'parts' in contents) {
        return [contents];
      }
      // Single Part (object with text, inlineData, etc.)
      if (typeof contents === 'object') {
        return [{ role: 'user', parts: [contents as Part] }];
      }
      return [];
    }

    // Handle array - could be Content[] or Part[]
    if (contents.length > 0) {
      const first = contents[0];
      if (typeof first === 'object' && first !== null && 'role' in first) {
        return contents as Content[];
      }
    }

    // Array of parts
    return [{ role: 'user', parts: contents as Part[] }];
  }

  /**
   * Convert Gemini-style request to provider-agnostic request
   */
  private convertRequest(request: GenerateContentParameters): ProviderRequest {
    const contents = this.normalizeContents(request.contents);
    const messages = this.convertContents(contents);

    const providerRequest: ProviderRequest = {
      messages,
      model: request.model,
    };

    // Extract system instruction
    if (request.config?.systemInstruction) {
      if (typeof request.config.systemInstruction === 'string') {
        providerRequest.systemPrompt = request.config.systemInstruction;
      } else if ('parts' in request.config.systemInstruction) {
        providerRequest.systemPrompt = this.extractTextFromParts(
          request.config.systemInstruction.parts || [],
        );
      }
    }

    // Extract generation config
    if (request.config) {
      providerRequest.temperature = request.config.temperature;
      providerRequest.maxTokens = request.config.maxOutputTokens;
      providerRequest.topP = request.config.topP;
      providerRequest.topK = request.config.topK;
      providerRequest.stopSequences = request.config.stopSequences;

      // Handle thinking config
      if (request.config.thinkingConfig?.thinkingBudget) {
        providerRequest.thinkingBudget =
          request.config.thinkingConfig.thinkingBudget;
      }

      // Extract tools from config
      if (
        request.config.tools &&
        Array.isArray(request.config.tools) &&
        request.config.tools.length > 0
      ) {
        providerRequest.tools = this.convertTools(request.config.tools);
      }
    }

    return providerRequest;
  }

  /**
   * Convert Gemini Content[] to ProviderMessage[]
   */
  private convertContents(contents: Content[]): ProviderMessage[] {
    return contents.map((content) => {
      const role = content.role === 'model' ? 'assistant' : 'user';
      const text = this.extractTextFromParts(content.parts || []);
      const toolCalls = this.extractToolCallsFromParts(content.parts || []);
      const toolResults = this.extractToolResultsFromParts(content.parts || []);

      const message: ProviderMessage = {
        role,
        content: text,
      };

      if (toolCalls.length > 0) {
        message.toolCalls = toolCalls;
      }

      if (toolResults.length > 0) {
        message.toolResults = toolResults;
      }

      return message;
    });
  }

  /**
   * Extract text from Content array
   */
  private extractTextFromContents(contents: Content[]): string {
    return contents
      .map((content) => this.extractTextFromParts(content.parts || []))
      .join('\n');
  }

  /**
   * Extract text from parts
   */
  private extractTextFromParts(parts: Part[]): string {
    return parts
      .filter((part) => 'text' in part && part.text)
      .map((part) => (part as { text: string }).text)
      .join('');
  }

  /**
   * Extract tool calls from parts
   */
  private extractToolCallsFromParts(parts: Part[]): ProviderToolCall[] {
    const toolCalls: ProviderToolCall[] = [];

    for (const part of parts) {
      if ('functionCall' in part && part.functionCall) {
        toolCalls.push({
          id: part.functionCall.name || '',
          name: part.functionCall.name || '',
          arguments: (part.functionCall.args as Record<string, unknown>) || {},
        });
      }
    }

    return toolCalls;
  }

  /**
   * Extract tool results from parts
   */
  private extractToolResultsFromParts(
    parts: Part[],
  ): Array<{ toolCallId: string; content: string; isError?: boolean }> {
    const results: Array<{
      toolCallId: string;
      content: string;
      isError?: boolean;
    }> = [];

    for (const part of parts) {
      if ('functionResponse' in part && part.functionResponse) {
        results.push({
          toolCallId: part.functionResponse.name || '',
          content:
            typeof part.functionResponse.response === 'string'
              ? part.functionResponse.response
              : JSON.stringify(part.functionResponse.response),
        });
      }
    }

    return results;
  }

  /**
   * Convert Gemini tools to provider tools
   */
  private convertTools(tools: GenerateContentConfig['tools']): ProviderTool[] {
    const providerTools: ProviderTool[] = [];

    if (!tools) return providerTools;

    // Handle array of tools
    const toolArray = Array.isArray(tools) ? tools : [tools];

    for (const tool of toolArray) {
      if (
        tool &&
        typeof tool === 'object' &&
        'functionDeclarations' in tool &&
        tool.functionDeclarations
      ) {
        for (const func of tool.functionDeclarations) {
          providerTools.push({
            name: func.name || '',
            description: func.description || '',
            parameters: {
              type: 'object',
              properties:
                (func.parameters?.properties as Record<string, unknown>) || {},
              required: func.parameters?.required,
            },
          });
        }
      }
    }

    return providerTools;
  }

  /**
   * Convert provider response to Gemini response
   */
  private convertResponse(
    response: ProviderResponse,
    model: string,
  ): GenerateContentResponse {
    const parts: Part[] = [];

    // Add text content
    if (response.content) {
      parts.push({ text: response.content });
    }

    // Add tool calls
    if (response.toolCalls) {
      for (const toolCall of response.toolCalls) {
        parts.push({
          functionCall: {
            name: toolCall.name,
            args: toolCall.arguments,
          },
        });
      }
    }

    // Convert finish reason
    let finishReason: FinishReason | undefined;
    switch (response.finishReason) {
      case 'stop':
        finishReason = FinishReason.STOP;
        break;
      case 'length':
        finishReason = FinishReason.MAX_TOKENS;
        break;
      case 'tool_use':
        finishReason = FinishReason.STOP;
        break;
      case 'content_filter':
        finishReason = FinishReason.SAFETY;
        break;
      default:
        finishReason = undefined;
    }

    const geminiResponse = Object.assign(new GenerateContentResponse(), {
      candidates: [
        {
          content: {
            role: 'model',
            parts,
          },
          finishReason,
        },
      ],
      modelVersion: model,
    });

    // Add usage metadata
    if (response.usage) {
      geminiResponse.usageMetadata = {
        promptTokenCount: response.usage.inputTokens,
        candidatesTokenCount: response.usage.outputTokens,
        totalTokenCount:
          response.usage.totalTokens ||
          response.usage.inputTokens + response.usage.outputTokens,
        cachedContentTokenCount: response.usage.cachedTokens,
      };
    }

    return geminiResponse;
  }

  /**
   * Convert stream chunk to Gemini response
   */
  private convertStreamChunk(
    chunk: ProviderStreamChunk,
    model: string,
  ): GenerateContentResponse {
    const parts: Part[] = [];

    // Add text delta
    if (chunk.delta || chunk.text) {
      parts.push({ text: chunk.delta || chunk.text || '' });
    }

    // Add tool calls on final chunk
    if (chunk.isFinal && chunk.toolCalls) {
      for (const toolCall of chunk.toolCalls) {
        parts.push({
          functionCall: {
            name: toolCall.name,
            args: toolCall.arguments,
          },
        });
      }
    }

    // Convert finish reason
    let finishReason: FinishReason | undefined;
    if (chunk.isFinal && chunk.finishReason) {
      switch (chunk.finishReason) {
        case 'stop':
          finishReason = FinishReason.STOP;
          break;
        case 'length':
          finishReason = FinishReason.MAX_TOKENS;
          break;
        case 'tool_use':
          finishReason = FinishReason.STOP;
          break;
        default:
          finishReason = undefined;
      }
    }

    const geminiResponse = Object.assign(new GenerateContentResponse(), {
      candidates: [
        {
          content: {
            role: 'model',
            parts,
          },
          finishReason,
        },
      ],
      modelVersion: model,
    });

    // Add usage on final chunk
    if (chunk.isFinal && chunk.usage) {
      geminiResponse.usageMetadata = {
        promptTokenCount: chunk.usage.inputTokens,
        candidatesTokenCount: chunk.usage.outputTokens,
        totalTokenCount:
          chunk.usage.totalTokens ||
          chunk.usage.inputTokens + chunk.usage.outputTokens,
      };
    }

    return geminiResponse;
  }
}

/**
 * Create a content generator that uses the multi-provider system
 */
export function createProviderContentGenerator(
  providerManager: ProviderManager,
): ContentGenerator {
  return new ProviderContentGeneratorAdapter(providerManager);
}
