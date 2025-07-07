/**
 * @license
 * Copyright 2025 Google LLC
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
  Candidate,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { ContentGenerator, ContentGeneratorConfig } from '../core/contentGenerator.js';

/**
 * Helper function to normalize ContentListUnion to Content array
 */
function normalizeContents(contents: any): Content[] {
  if (!contents) return [];

  // If it's already an array of Content objects
  if (Array.isArray(contents)) {
    return contents.filter((item: any) => item && typeof item === 'object' && 'parts' in item);
  }

  // If it's a single Content object
  if (typeof contents === 'object' && 'parts' in contents) {
    return [contents];
  }

  // If it's a string or PartUnion, convert to Content
  if (typeof contents === 'string') {
    return [{ parts: [{ text: contents }], role: 'user' }];
  }

  // If it's a Part object
  if (typeof contents === 'object' && ('text' in contents || 'inlineData' in contents)) {
    return [{ parts: [contents], role: 'user' }];
  }

  return [];
}

/**
 * Generic HTTP-based content generator for OpenAI-compatible APIs
 */
export class OpenAICompatibleContentGenerator implements ContentGenerator {
  constructor(protected config: ContentGeneratorConfig) {}

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const openAIRequest = this.convertToOpenAIFormat(request);
    const url = `${this.config.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.customHeaders,
      },
      body: JSON.stringify(openAIRequest),
      signal: this.config.timeout ? AbortSignal.timeout(this.config.timeout) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const result = this.convertFromOpenAIFormat(data);
    if (!result) {
      throw new Error('Failed to convert OpenAI response');
    }
    return result;
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.generateContentStreamInternal(request);
  }

  protected async *generateContentStreamInternal(
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const openAIRequest = { ...this.convertToOpenAIFormat(request), stream: true };
    
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.customHeaders,
      },
      body: JSON.stringify(openAIRequest),
      signal: this.config.timeout ? AbortSignal.timeout(this.config.timeout) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    // Track accumulated tool call arguments for streaming
    const toolCallAccumulator = new Map<string, {
      id: string;
      name: string;
      arguments: string;
    }>();

    // Track mapping from index to actual call ID for streaming
    const indexToIdMap = new Map<number, string>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              // Process any accumulated tool calls at the end
              if (toolCallAccumulator.size > 0) {
                const completedToolCalls = Array.from(toolCallAccumulator.values());
                const geminiResponse = this.convertAccumulatedToolCallsToGemini(completedToolCalls);
                if (geminiResponse) {
                  yield geminiResponse;
                }
              }
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const geminiResponse = this.convertFromOpenAIFormat(parsed, true, toolCallAccumulator, indexToIdMap);
              if (geminiResponse) {
                yield geminiResponse;
              }
            } catch (e) {
              // Skip invalid JSON - this is expected for some OpenAI streaming events
              // Don't log this as it's normal behavior
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Approximate token counting - most APIs don't provide exact token counting
    const contents = normalizeContents(request.contents);
    const text = this.extractTextFromContents(contents);
    const approximateTokens = Math.ceil(text.length / 4); // Rough approximation

    return {
      totalTokens: approximateTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    const contents = normalizeContents(request.contents);
    const text = this.extractTextFromContents(contents);
    
    const response = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.customHeaders,
      },
      body: JSON.stringify({
        input: text,
        model: request.model || 'text-embedding-ada-002',
      }),
      signal: this.config.timeout ? AbortSignal.timeout(this.config.timeout) : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      embeddings: [{
        values: data.data[0].embedding,
      }],
    };
  }

  protected convertToOpenAIFormat(request: GenerateContentParameters): any {
    const contents = normalizeContents(request.contents);
    let messages = contents.map((content: Content) => ({
      role: content.role === 'model' ? 'assistant' : content.role,
      content: content.parts?.map((part: Part) => {
        if ('text' in part) {
          return part.text;
        }
        // Handle other part types as needed
        return JSON.stringify(part);
      }).join('\n') || '',
    }));

    // Handle JSON generation requests by adding a system message
    if (request.config?.responseMimeType === 'application/json' && request.config?.responseSchema) {
      const jsonInstruction = `You must respond with valid JSON only. No additional text, explanations, or formatting. The response must conform to this schema: ${JSON.stringify(request.config.responseSchema)}`;

      // Add system message at the beginning
      messages = [
        { role: 'system', content: jsonInstruction },
        ...messages
      ];
    }

    const openAIRequest: any = {
      model: request.model || this.config.model,
      messages,
      temperature: request.config?.temperature || 0.7,
      max_tokens: request.config?.maxOutputTokens || 2048,
      top_p: request.config?.topP || 1,
      stream: false,
    };

    // Convert Gemini tools to OpenAI format
    if (request.config?.tools && request.config.tools.length > 0) {
      const openAITools: any[] = [];

      for (const tool of request.config.tools) {
        if ('functionDeclarations' in tool && tool.functionDeclarations) {
          for (const funcDecl of tool.functionDeclarations) {
            openAITools.push({
              type: 'function',
              function: {
                name: funcDecl.name,
                description: funcDecl.description || '',
                parameters: funcDecl.parameters || { type: 'object', properties: {} },
              },
            });
          }
        }
      }

      if (openAITools.length > 0) {
        openAIRequest.tools = openAITools;
        openAIRequest.tool_choice = 'auto';
      }
    }

    return openAIRequest;
  }

  protected convertFromOpenAIFormat(
    data: any,
    isStream = false,
    toolCallAccumulator?: Map<string, { id: string; name: string; arguments: string }>,
    indexToIdMap?: Map<number, string>
  ): GenerateContentResponse | null {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('No choices in response');
    }

    const text = isStream
      ? choice.delta?.content || ''
      : choice.message?.content || '';

    // Parse function calls from OpenAI format to Gemini format
    const functionCalls: any[] = [];
    const message = isStream ? choice.delta : choice.message;

    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {

        if ((toolCall.type === 'function' || isStream) && toolCall.function) {
          if (isStream && toolCallAccumulator && indexToIdMap) {
            // Handle streaming tool calls - accumulate arguments
            const index = toolCall.index || 0;

            // If this chunk has an ID, store the mapping
            if (toolCall.id) {
              indexToIdMap.set(index, toolCall.id);
            }

            // Get the actual call ID from the mapping or use the current ID
            const callId = indexToIdMap.get(index) || toolCall.id || `call_${index}`;

            if (!toolCallAccumulator.has(callId)) {
              toolCallAccumulator.set(callId, {
                id: callId,
                name: toolCall.function.name || '',
                arguments: ''
              });
            }

            const accumulated = toolCallAccumulator.get(callId)!;
            if (toolCall.function.name) {
              accumulated.name = toolCall.function.name;
            }
            if (toolCall.function.arguments) {
              accumulated.arguments += toolCall.function.arguments;
            }

            // Don't yield function calls during streaming - wait for completion
            continue;
          } else {
            // Handle non-streaming tool calls
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments || {};

              functionCalls.push({
                id: toolCall.id,
                name: toolCall.function.name,
                args: args,
              });
            } catch (e) {
              // Failed to parse tool call arguments - this can happen with malformed JSON
              // Include the tool call with empty args if parsing fails
              functionCalls.push({
                id: toolCall.id,
                name: toolCall.function.name,
                args: {},
              });
            }
          }
        }
      }
    }

    // For streaming, only return response if there's text content
    if (isStream && !text && functionCalls.length === 0) {
      return null;
    }

    const candidate: Candidate = {
      content: {
        parts: [{ text }],
        role: 'model',
      },
      finishReason: choice.finish_reason || 'STOP',
      index: 0,
    };

    const usageMetadata: GenerateContentResponseUsageMetadata = {
      promptTokenCount: data.usage?.prompt_tokens || 0,
      candidatesTokenCount: data.usage?.completion_tokens || 0,
      totalTokenCount: data.usage?.total_tokens || 0,
    };

    return {
      candidates: [candidate],
      usageMetadata,
      text: text,
      data: undefined,
      functionCalls: functionCalls,
      executableCode: undefined,
      codeExecutionResult: undefined,
    };
  }

  protected convertAccumulatedToolCallsToGemini(
    toolCalls: Array<{ id: string; name: string; arguments: string }>
  ): GenerateContentResponse | null {
    const functionCalls: any[] = [];

    for (const toolCall of toolCalls) {
      try {
        const args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
        functionCalls.push({
          id: toolCall.id,
          name: toolCall.name,
          args: args,
        });
      } catch (e) {
        // Failed to parse accumulated tool call arguments - this can happen with malformed JSON
        // Include the tool call with empty args if parsing fails
        functionCalls.push({
          id: toolCall.id,
          name: toolCall.name,
          args: {},
        });
      }
    }

    if (functionCalls.length === 0) {
      return null;
    }

    const candidate: Candidate = {
      content: {
        parts: [{ text: '' }],
        role: 'model',
      },
      finishReason: 'tool_calls' as any,
      index: 0,
    };

    const usageMetadata: GenerateContentResponseUsageMetadata = {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
    };

    return {
      candidates: [candidate],
      usageMetadata,
      text: '',
      data: undefined,
      functionCalls: functionCalls,
      executableCode: undefined,
      codeExecutionResult: undefined,
    };
  }

  protected extractTextFromContents(contents: Content[]): string {
    return contents
      .map(content =>
        content.parts
          ?.map((part: Part) => ('text' in part ? part.text : ''))
          .join(' ') || ''
      )
      .join(' ');
  }


}