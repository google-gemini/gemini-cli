/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  UniversalMessage,
  UniversalResponse,
  UniversalStreamEvent,
  ProviderCapabilities,
  ConnectionStatus,
  ModelProviderConfig,
  ToolCall
} from './types.js';
import { BaseModelProvider } from './BaseModelProvider.js';
import type { Config } from '../config/config.js';
import { get_encoding } from 'tiktoken';
import type { Tiktoken } from 'tiktoken';




interface LMStudioMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: LMStudioToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface LMStudioToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface LMStudioResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: LMStudioToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

interface LMStudioStreamChunk {
  choices: Array<{
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        index?: number;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface LMStudioTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

interface LMStudioRequestBody {
  model: string;
  messages: LMStudioMessage[];
  max_tokens: number;
  temperature: number;
  stream: boolean;
  tools?: LMStudioTool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface LMStudioModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export class LMStudioProvider extends BaseModelProvider {
  private baseUrl: string;
  private tokenEncoder?: Tiktoken;

  constructor(config: ModelProviderConfig, configInstance?: Config) {
    super(config, configInstance);
    this.baseUrl = config.baseUrl || 'http://127.0.0.1:1234/v1';
    
    // Initialize tiktoken encoder for accurate token counting
    try {
      this.tokenEncoder = get_encoding('cl100k_base'); // GPT-4/3.5 compatible encoding
      console.log('[LMStudioProvider] Initialized tiktoken encoder');
    } catch (error) {
      console.warn('[LMStudioProvider] Failed to initialize tiktoken encoder:', error);
    }
  }



  async initialize(): Promise<void> {
    await this.testConnection();
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    const startTime = Date.now();
    try {
      const isConnected = await this.testConnection();
      const latency = Date.now() - startTime;
      
      return {
        status: isConnected ? 'connected' : 'error',
        lastChecked: new Date(),
        latency: isConnected ? latency : undefined,
        error: isConnected ? undefined : 'LM Studio server not running or unreachable'
      };
    } catch (error) {
      return {
        status: 'error',
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error connecting to LM Studio'
      };
    }
  }

  async sendMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse> {
    const lmStudioMessages = this.convertToLMStudioMessages(messages);
    
    const requestBody: LMStudioRequestBody = {
      model: this.config.model,
      messages: lmStudioMessages,
      max_tokens: 2048,
      temperature: 0.7,
      stream: false
    };

    // Add tools if available
    if (this.toolDeclarations && this.toolDeclarations.length > 0) {
      requestBody.tools = this.toolDeclarations
        .filter(tool => tool.name && tool.description)
        .map(tool => ({
          type: 'function',
          function: {
            name: tool.name!,
            description: tool.description!,
            parameters: tool.parametersJsonSchema
          }
        }));
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      throw this.createError(`LM Studio API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as LMStudioResponse;
    
    // Debug: Print complete response to see what LM Studio actually returns
    console.log(`[LMStudioProvider] Complete API response:`, JSON.stringify(data, null, 2));
    
    // Note: Usage information available in data.usage if needed
    if (!data.usage) {
      console.log(`[LMStudioProvider] No usage data in response`);
    }
    
    return this.convertFromLMStudioResponse(data);
  }

  async *sendMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): AsyncGenerator<UniversalStreamEvent> {
    const lmStudioMessages = this.convertToLMStudioMessages(messages);
    
    const requestBody: LMStudioRequestBody = {
      model: this.config.model,
      messages: lmStudioMessages,
      max_tokens: 10000,
      temperature: 0.0,
      stream: true
    };

    // Add tools if available
    if (this.toolDeclarations && this.toolDeclarations.length > 0) {
      requestBody.tools = this.toolDeclarations
        .filter(tool => tool.name && tool.description)
        .map(tool => ({
          type: 'function',
          function: {
            name: tool.name!,
            description: tool.description!,
            parameters: tool.parametersJsonSchema
          }
        }));
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      yield {
        type: 'error',
        error: this.createError(`LM Studio API error: ${response.status} ${response.statusText}`)
      };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield {
        type: 'error',
        error: this.createError('No response body available')
      };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    const toolCalls: ToolCall[] = [];
    const accumulatedToolCalls: Array<{ id?: string; type: 'function'; function: { name: string; arguments: string } }> = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.trim() === 'data: [DONE]') {
            // Log final state when stream is done
            console.log(`[LMStudioProvider] Stream [DONE]`);
            
            // Process accumulated tool calls when stream is done (same as OpenAIProvider)
            if (accumulatedToolCalls.length > 0) {
              console.log('[LMStudioProvider] Processing accumulated tool calls at [DONE]:', accumulatedToolCalls.length);
              for (const toolCall of accumulatedToolCalls) {
                if (toolCall.function.name && toolCall.function.arguments) {
                  let args: Record<string, unknown> = {};
                  try {
                    args = JSON.parse(toolCall.function.arguments);
                  } catch (error) {
                    console.error('[LMStudioProvider] Failed to parse tool arguments:', toolCall.function.arguments, error);
                    args = {};
                  }
                  
                  const universalToolCall: ToolCall = {
                    id: toolCall.id || `call_${Date.now()}`,
                    name: toolCall.function.name,
                    arguments: args
                  };
                  toolCalls.push(universalToolCall);
                  
                  yield {
                    type: 'tool_call',
                    toolCall: universalToolCall
                  };
                }
              }
            }

            yield {
              type: 'done',
              response: {
                content: fullContent,
                finishReason: 'stop',
                model: this.config.model
              }
            };
            return;
          }

          if (line.startsWith('data: ')) {
            try {
              const chunk = JSON.parse(line.slice(6)) as LMStudioStreamChunk;
              const delta = chunk.choices[0]?.delta;

              // Note: Usage information available in chunk.usage if needed 
              
              if (chunk.choices[0]?.finish_reason) {
                // Log when we reach the end but don't have usage data
                console.log(`[LMStudioProvider] Stream chunk at finish_reason but no usage data:`, JSON.stringify(chunk, null, 2));
              }

              if (delta?.content) {
                fullContent += delta.content;
                yield {
                  type: 'content_delta',
                  content: delta.content
                };
              }

              if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  // Accumulate tool calls (they might come in chunks)
                  if (toolCall.index !== undefined) {
                    if (!accumulatedToolCalls[toolCall.index]) {
                      accumulatedToolCalls[toolCall.index] = {
                        id: toolCall.id,
                        type: 'function',
                        function: { name: '', arguments: '' }
                      };
                    }
                    
                    if (toolCall.function?.name) {
                      accumulatedToolCalls[toolCall.index].function.name += toolCall.function.name;
                    }
                    if (toolCall.function?.arguments) {
                      accumulatedToolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
                    }
                  }
                }
              }

              if (chunk.choices[0]?.finish_reason) {
                const finishReason = chunk.choices[0].finish_reason;
                console.log(`[LMStudioProvider] Stream finished with reason: ${finishReason}, accumulated tool calls: ${accumulatedToolCalls.length}`);
                
                // BUG FIX: LM Studio sometimes returns finish_reason: "tool_calls" but provides no tool call data
                // This causes the system to hang waiting for tool calls that never come
                if (finishReason === 'tool_calls' && accumulatedToolCalls.length === 0) {
                  console.error('[LMStudioProvider] LM Studio bug detected: finish_reason is "tool_calls" but no tool call data provided');
                  yield {
                    type: 'error',
                    error: new Error('LM Studio returned finish_reason "tool_calls" but provided no tool call data. This is a known LM Studio bug. Please try again or use a different model.')
                  };
                  return;
                }
                
                // Process accumulated tool calls when finish_reason is available
                if (accumulatedToolCalls.length > 0) {
                  console.log('[LMStudioProvider] Processing accumulated tool calls:', accumulatedToolCalls.length);
                  for (const toolCall of accumulatedToolCalls) {
                    if (toolCall.function.name && toolCall.function.arguments) {
                      let args: Record<string, unknown> = {};
                      try {
                        args = JSON.parse(toolCall.function.arguments);
                      } catch (error) {
                        console.error('[LMStudioProvider] Failed to parse tool arguments:', toolCall.function.arguments, error);
                        args = {};
                      }
                      
                      const universalToolCall: ToolCall = {
                        id: toolCall.id || `call_${Date.now()}`,
                        name: toolCall.function.name.trim(), // Clean tool name
                        arguments: args
                      };
                      toolCalls.push(universalToolCall);
                      
                      yield {
                        type: 'tool_call',
                        toolCall: universalToolCall
                      };
                      
                      console.log('[LMStudioProvider] Processed tool call:', toolCall.function.name, args);
                    }
                  }
                }
                
                yield {
                  type: 'done',
                  response: {
                    content: fullContent,
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                    finishReason: this.mapFinishReason(chunk.choices[0].finish_reason),
                    model: this.config.model
                  }
                };
                return;
              }
            } catch (parseError) {
              console.error('Error parsing LM Studio stream chunk:', parseError);
              continue;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }


  static async getAvailableModels(baseUrl = 'http://127.0.0.1:1234/v1'): Promise<string[]> {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`LMStudioProvider: HTTP error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as { data: LMStudioModel[] };
    const models = data.data.map(model => model.id).sort();

    if (models.length === 0) {
      throw new Error('LMStudioProvider: No models found in LM Studio response');
    }

    console.log(`LMStudioProvider: Retrieved ${models.length} models from LM Studio:`, models);
    return models;
  }

  async countTokens(messages: UniversalMessage[]): Promise<{ totalTokens: number }> {
    try {
      // Use tiktoken for accurate token counting without API calls
      if (this.tokenEncoder) {
        try {
          // Convert messages to text format similar to OpenAI chat format
          const messageText = messages.map(msg => {
            let content = `${msg.role}: ${msg.content}`;
            if (msg.toolCalls && msg.toolCalls.length > 0) {
              content += ` [tool_calls: ${JSON.stringify(msg.toolCalls)}]`;
            }
            return content;
          }).join('\n');
          
          const tokenCount = this.tokenEncoder.encode(messageText).length;
          console.log(`[LMStudioProvider] tiktoken count: ${tokenCount} tokens for ${messages.length} messages`);
          return { totalTokens: tokenCount };
        } catch (tiktokenError) {
          console.warn('[LMStudioProvider] tiktoken encoding failed:', tiktokenError);
        }
      }
      
      // Fallback to character-based estimation
      const totalChars = messages.reduce((sum, msg) => sum + JSON.stringify(msg).length, 0);
      const estimatedTokens = Math.ceil(totalChars / 4);
      
      console.log(`[LMStudioProvider] Fallback to character estimation: ${totalChars} chars ≈ ${estimatedTokens} tokens`);
      return { totalTokens: estimatedTokens };
    } catch (error) {
      console.error('[LMStudioProvider] Token counting failed:', error);
      return { totalTokens: 0 };
    }
  }

  setTools(): void {
    // LM Studio doesn't support native tool calls, but we can store tool declarations
    // for potential use in system prompts or other mechanisms
    if (this.configInstance) {
      const toolRegistry = this.configInstance.getToolRegistry();
      this.toolDeclarations = toolRegistry.getFunctionDeclarations();
      console.log(`[LMStudioProvider] Received ${this.toolDeclarations.length} tool declarations:`, 
        this.toolDeclarations.map(tool => tool.name));
    }
  }

  protected getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsSystemMessages: true,
      supportsImages: false,
      maxTokens: 10000,
      maxMessages: 100
    };
  }

  private convertToLMStudioMessages(messages: UniversalMessage[]): LMStudioMessage[] {
    return messages
      .filter(msg => msg.role !== 'tool')
      .map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      }));
  }

  private convertFromLMStudioResponse(response: LMStudioResponse): UniversalResponse {
    const choice = response.choices[0];
    
    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
      })),
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined,
      model: response.model
    };
  }

  private mapFinishReason(reason: string): UniversalResponse['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'tool_calls': return 'tool_calls';
      default: return 'stop';
    }
  }

  /**
   * Clean up tiktoken encoder resources
   */
  destroy(): void {
    if (this.tokenEncoder) {
      try {
        this.tokenEncoder.free();
        console.log('[LMStudioProvider] Cleaned up tiktoken encoder');
      } catch (error) {
        console.warn('[LMStudioProvider] Error cleaning up tiktoken encoder:', error);
      }
    }
  }

  async sendCompressionMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse> {
    const lmStudioMessages = this.convertToLMStudioMessages(messages);
    
    const requestBody: LMStudioRequestBody = {
      model: this.config.model,
      messages: lmStudioMessages,
      max_tokens: 4096,
      temperature: 0.7,
      stream: false
      // Note: No tools added for compression requests
    };

    const headers = {
      'Content-Type': 'application/json'
    };
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      let errorMessage = `LM Studio API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.text();
        if (errorData) {
          errorMessage += ` - ${errorData}`;
        }
      } catch (parseError) {
        console.error('Error parsing LM Studio error response:', parseError);
      }
      throw this.createError(errorMessage);
    }

    const data = await response.json();
    
    return this.convertFromLMStudioResponse(data);
  }
}