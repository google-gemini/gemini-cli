/**
 * @license
 * Modified for LM Studio integration
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentParameters,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  Content,
  Part,
  FunctionCall,
  FinishReason,
  ContentListUnion,
  Tool,
  ToolListUnion,
  ContentUnion,
} from '@google/genai';
import { createUserContent, GenerateContentResponse } from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';

// LM Studio default configuration
export const LM_STUDIO_DEFAULT_BASE_URL = 'http://localhost:1234/v1';
export const LM_STUDIO_DEFAULT_MODEL = 'local-model';

interface LMStudioConfig {
  baseURL: string;
  apiKey?: string;
  model?: string;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: object;
  };
}

interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

/**
 * LM Studio Content Generator
 * Implements the ContentGenerator interface using LM Studio's OpenAI-compatible API
 */
export class LMStudioContentGenerator implements ContentGenerator {
  private config: LMStudioConfig;
  private toolCallIdCounter = 0;

  constructor(config: LMStudioConfig) {
    this.config = {
      baseURL: config.baseURL || LM_STUDIO_DEFAULT_BASE_URL,
      apiKey: config.apiKey || 'lm-studio',
      model: config.model || LM_STUDIO_DEFAULT_MODEL,
    };
  }

  /**
   * Convert Gemini Content to OpenAI Messages
   */
  private convertToOpenAIMessages(
    contents: ContentListUnion,
    systemInstruction?: ContentUnion,
  ): OpenAIMessage[] {
    // Convert ContentListUnion to Content array - handles strings, objects, and arrays
    let contentsArray: Content[] = [];
    if (typeof contents === 'string') {
      contentsArray = [createUserContent(contents)];
    } else if (Array.isArray(contents)) {
      contentsArray = contents as Content[];
    } else {
      contentsArray = [contents as Content];
    }

    // Extract system instruction text if present
    let systemText: string | undefined;
    if (systemInstruction) {
      if (typeof systemInstruction === 'string') {
        systemText = systemInstruction;
      } else {
        const content = systemInstruction as Content;
        systemText = content.parts
          ?.map((p) => p.text)
          .filter(Boolean)
          .join('\n');
      }
    }

    const messages: OpenAIMessage[] = [];

    // Add system instruction if provided
    if (systemText) {
      messages.push({
        role: 'system',
        content: systemText,
      });
    }

    for (const content of contentsArray) {
      const role = content.role === 'model' ? 'assistant' : 'user';

      if (!content.parts || content.parts.length === 0) {
        continue;
      }

      // Handle function calls (tool calls in OpenAI)
      const toolCalls: OpenAIToolCall[] = [];
      let textContent = '';
      let hasFunctionResponse = false;

      for (const part of content.parts) {
        if (part.text) {
          textContent += part.text;
        } else if (part.functionCall) {
          const toolCallId = `call_${this.toolCallIdCounter++}`;
          toolCalls.push({
            id: toolCallId,
            type: 'function',
            function: {
              name: part.functionCall.name || 'unknown',
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          });
        } else if (part.functionResponse) {
          hasFunctionResponse = true;
          // Function responses become tool messages in OpenAI
          messages.push({
            role: 'tool',
            tool_call_id: `call_${part.functionResponse.name}`,
            name: part.functionResponse.name,
            content: JSON.stringify(part.functionResponse.response),
          });
        }
      }

      // Add message if it has content or tool calls
      if (!hasFunctionResponse) {
        if (toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: textContent || null,
            tool_calls: toolCalls,
          });
        } else if (textContent) {
          messages.push({
            role: role,
            content: textContent,
          });
        }
      }
    }

    return messages;
  }

  /**
   * Convert Gemini function declarations to OpenAI tools
   */
  private convertToOpenAITools(tools?: ToolListUnion): OpenAITool[] | undefined {
    if (!tools) {
      return undefined;
    }

    const toolsArray = (Array.isArray(tools) ? tools : [tools]) as Tool[];

    const openAITools: OpenAITool[] = [];
    for (const tool of toolsArray) {
      if ('functionDeclarations' in tool && tool.functionDeclarations) {
        for (const func of tool.functionDeclarations) {
          openAITools.push({
            type: 'function',
            function: {
              name: func.name || 'unknown',
              description: func.description || '',
              parameters: func.parameters as object,
            },
          });
        }
      }
    }

    return openAITools.length > 0 ? openAITools : undefined;
  }

  /**
   * Convert OpenAI finish reason to Gemini FinishReason
   */
  private convertFinishReason(reason: string | null): FinishReason | undefined {
    if (!reason) return undefined;
    // Map OpenAI finish reasons to Gemini FinishReason enum
    switch (reason) {
      case 'stop':
        return 'STOP' as FinishReason;
      case 'length':
        return 'MAX_TOKENS' as FinishReason;
      case 'tool_calls':
      case 'function_call':
        return 'STOP' as FinishReason;
      case 'content_filter':
        return 'SAFETY' as FinishReason;
      default:
        return 'OTHER' as FinishReason;
    }
  }

  /**
   * Convert OpenAI response to Gemini format
   */
  private convertToGeminiResponse(
    response: OpenAIChatCompletionResponse,
  ): GenerateContentResponse {
    const choice = response.choices[0];
    const message = choice?.message;

    const parts: Part[] = [];

    // Add text content
    if (message?.content) {
      parts.push({ text: message.content });
    }

    // Add function calls
    if (message?.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function') {
          const functionCall: FunctionCall = {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments || '{}'),
          };
          parts.push({ functionCall });
        }
      }
    }

    // Create response with proper structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geminiResponse: any = {
      candidates: [
        {
          content: {
            role: 'model',
            parts,
          },
          finishReason: this.convertFinishReason(choice?.finish_reason),
          index: 0,
        },
      ],
      usageMetadata: response.usage
        ? {
            promptTokenCount: response.usage.prompt_tokens,
            candidatesTokenCount: response.usage.completion_tokens,
            totalTokenCount: response.usage.total_tokens,
          }
        : undefined,
      // Add placeholder methods that will be properly set when prototype is applied
      text: '',
      data: {},
      functionCalls: [],
      executableCode: [],
      codeExecutionResult: [],
    };
    return geminiResponse as GenerateContentResponse;
  }

  /**
   * Generate content (non-streaming)
   */
  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const messages = this.convertToOpenAIMessages(
      request.contents,
      request.config?.systemInstruction,
    );
    const tools = this.convertToOpenAITools(request.config?.tools);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = {
      model: request.model || this.config.model,
      messages,
      temperature: request.config?.temperature,
      max_tokens: request.config?.maxOutputTokens,
      top_p: request.config?.topP,
    };

    if (tools) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${this.config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LM Studio API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as OpenAIChatCompletionResponse;
    const geminiResponse = this.convertToGeminiResponse(data);
    return Object.setPrototypeOf(geminiResponse, GenerateContentResponse.prototype);
  }

  /**
   * Generate content stream
   */
  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const messages = this.convertToOpenAIMessages(
      request.contents,
      request.config?.systemInstruction,
    );
    const tools = this.convertToOpenAITools(request.config?.tools);

    const body: any = {
      model: request.model || this.config.model,
      messages,
      temperature: request.config?.temperature,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      max_tokens: request.config?.maxOutputTokens,
      top_p: request.config?.topP,
      stream: true,
    };

    if (tools) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch(`${this.config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LM Studio API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let localToolCallCounter = 0;

    // Return an async generator (cannot bind 'this', use arrow function style)
    return (async function* () {
      let buffer = '';
      let accumulatedText = '';
      let accumulatedToolCalls: OpenAIToolCall[] = [];

      try {
        while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = trimmed.slice(6);
            const chunk = JSON.parse(json) as OpenAIChatCompletionChunk;
            const delta = chunk.choices[0]?.delta;

            if (!delta) continue;

            // Accumulate content
            if (delta.content) {
              accumulatedText += delta.content;
            }

            // Accumulate tool calls
            if (delta.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                if (!accumulatedToolCalls[toolCall.index]) {
                  accumulatedToolCalls[toolCall.index] = {
                    id: toolCall.id || `call_${localToolCallCounter++}`,
                    type: 'function',
                    function: {
                      name: toolCall.function?.name || '',
                      arguments: toolCall.function?.arguments || '',
                    },
                  };
                } else {
                  if (toolCall.function?.name) {
                    accumulatedToolCalls[toolCall.index].function.name +=
                      toolCall.function.name;
                  }
                  if (toolCall.function?.arguments) {
                    accumulatedToolCalls[toolCall.index].function.arguments +=
                      toolCall.function.arguments;
                  }
                }
              }
            }

            // Yield intermediate response
            const parts: Part[] = [];
            if (accumulatedText) {
              parts.push({ text: accumulatedText });
            }

            if (parts.length > 0 || accumulatedToolCalls.length > 0) {
              const response = {
                candidates: [
                  {
                    content: {
                      role: 'model',
                      parts,
                    },
                    finishReason: undefined,
                    index: 0,
                  },
                ],
              };
              yield Object.setPrototypeOf(
                response,
                GenerateContentResponse.prototype,
              );
            }
          } catch (e) {
            console.error('Error parsing SSE chunk:', e);
          }
        }
      }

      // Final yield with complete response including tool calls
      if (accumulatedText || accumulatedToolCalls.length > 0) {
        const parts: Part[] = [];
        if (accumulatedText) {
          parts.push({ text: accumulatedText });
        }
        for (const toolCall of accumulatedToolCalls) {
          if (toolCall) {
            parts.push({
              functionCall: {
                name: toolCall.function.name,
                args: JSON.parse(toolCall.function.arguments || '{}'),
              },
            });
          }
        }

        const finalResponse = {
          candidates: [
            {
              content: {
                role: 'model',
                parts,
              },
              finishReason: 'STOP' as FinishReason,
              index: 0,
            },
          ],
        };
        yield Object.setPrototypeOf(
          finalResponse,
          GenerateContentResponse.prototype,
        );
      }
    } finally {
      reader.releaseLock();
    }
    })();
  }

  /**
   * Count tokens (approximate for LM Studio)
   */
  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // LM Studio doesn't have a token counting endpoint
    // Provide a rough estimate: ~4 characters per token
    let textLength = 0;

    let contentsArray: Content[] = [];
    if (typeof request.contents === 'string') {
      contentsArray = [createUserContent(request.contents)];
    } else if (Array.isArray(request.contents)) {
      contentsArray = request.contents as Content[];
    } else {
      contentsArray = [request.contents as Content];
    }

    for (const content of contentsArray) {
      if (content.parts) {
        for (const part of content.parts) {
          if (part.text) {
            textLength += part.text.length;
          }
        }
      }
    }

    const estimatedTokens = Math.ceil(textLength / 4);

    return {
      totalTokens: estimatedTokens,
    };
  }

  /**
   * Embed content (not typically supported by LM Studio)
   */
  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error('Embedding is not supported by LM Studio');
  }
}
