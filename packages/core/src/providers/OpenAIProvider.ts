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

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
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

interface OpenAIResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
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

interface OpenAIStreamChunk {
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

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

interface OpenAIRequestBody {
  model: string;
  messages: OpenAIMessage[];
  max_tokens: number;
  temperature: number;
  stream?: boolean;
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export class OpenAIProvider extends BaseModelProvider {
  private baseUrl: string;

  constructor(config: ModelProviderConfig, configInstance?: Config) {
    super(config, configInstance);
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    // Don't validate config here - API key will come from AuthManager
  }

  /**
   * Get API key from AuthManager based on user's authentication preference
   */
  private async getApiKey(): Promise<string> {
    try {
      const { AuthManager } = await import('../auth/AuthManager.js');
      const authManager = AuthManager.getInstance();
      if (this.configInstance) {
        authManager.setConfig(this.configInstance);
      }
      
      const credentials = await authManager.getAccessCredentials('openai');
      if (!credentials?.apiKey) {
        throw new Error('No OpenAI API key available. Please set OPENAI_API_KEY environment variable.');
      }
      
      return credentials.apiKey;
    } catch (error) {
      throw new Error(`OpenAI authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async initialize(): Promise<void> {
    await this.testConnection();
  }

  async testConnection(): Promise<boolean> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.baseUrl}/models`, {
        headers
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
        error: isConnected ? undefined : 'Failed to connect to OpenAI API'
      };
    } catch (error) {
      return {
        status: 'error',
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async sendMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse> {
    const openaiMessages = this.convertToOpenAIMessages(messages);
    
    const requestBody: OpenAIRequestBody = {
      model: this.config.model,
      messages: openaiMessages,
      max_tokens: 4096,
      temperature: 0.7
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

    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      let errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.text();
        if (errorData) {
          errorMessage += ` - ${errorData}`;
        }
      } catch (parseError) {
        // Ignore parsing errors, use basic error message
        console.error('Error parsing OpenAI error response:', parseError);
      }
      throw this.createError(errorMessage);
    }

    const data = await response.json() as OpenAIResponse;
    
    return this.convertFromOpenAIResponse(data);
  }

  async *sendMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): AsyncGenerator<UniversalStreamEvent> {
    const openaiMessages = this.convertToOpenAIMessages(messages);
    
    const requestBody: OpenAIRequestBody = {
      model: this.config.model,
      messages: openaiMessages,
      max_tokens: 4096,
      temperature: 0.7,
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

    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      let errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.text();
        if (errorData) {
          errorMessage += ` - ${errorData}`;
        }
      } catch (parseError) {
        // Ignore parsing errors, use basic error message
        console.error('Error parsing OpenAI error response:', parseError);
      }
      
      yield {
        type: 'error',
        error: this.createError(errorMessage)
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
            // Process accumulated tool calls when stream is done
            if (accumulatedToolCalls.length > 0) {
              console.log('[OpenAIProvider] Processing accumulated tool calls:', accumulatedToolCalls.length);
              for (const toolCall of accumulatedToolCalls) {
                if (toolCall.function.name && toolCall.function.arguments) {
                  let args: Record<string, unknown> = {};
                  try {
                    args = JSON.parse(toolCall.function.arguments);
                  } catch (error) {
                    console.error('[OpenAIProvider] Failed to parse tool arguments:', toolCall.function.arguments, error);
                    args = {};
                  }
                  
                  const universalToolCall: ToolCall = {
                    id: toolCall.id || `call_${Date.now()}`,
                    name: toolCall.function.name.trim(),
                    arguments: args
                  };
                  toolCalls.push(universalToolCall);
                  
                  yield {
                    type: 'tool_call',
                    toolCall: universalToolCall
                  };
                  
                  console.log('[OpenAIProvider] Processed tool call:', toolCall.function.name, args);
                }
              }
            }
            
            yield {
              type: 'done',
              response: {
                content: fullContent,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                finishReason: 'stop',
                model: this.config.model
              }
            };
            return;
          }

          if (line.startsWith('data: ')) {
            try {
              const chunk = JSON.parse(line.slice(6)) as OpenAIStreamChunk;
              const delta = chunk.choices[0]?.delta;

              // Note: Usage information available in chunk.usage if needed

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
            } catch (parseError) {
              console.error('Error parsing OpenAI stream chunk:', parseError);
              continue;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }


  static async getAvailableModels(baseUrl = 'https://api.openai.com/v1'): Promise<string[]> {
    try {
      // Get API key from AuthManager
      const { AuthManager } = await import('../auth/AuthManager.js');
      const authManager = AuthManager.getInstance();
      
      const credentials = await authManager.getAccessCredentials('openai');
      if (!credentials?.apiKey) {
        throw new Error('OpenAIProvider: No OpenAI API key available. Please set OPENAI_API_KEY environment variable.');
      }

      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${credentials.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`OpenAIProvider: HTTP error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { data: Array<{ id: string }> };
      const models = data.data
        .map(model => model.id)
        .filter(id => id.startsWith('gpt-') || id.startsWith('o1-'))
        .sort();

      if (models.length === 0) {
        throw new Error('OpenAIProvider: No compatible models found in API response');
      }

      console.log(`OpenAIProvider: Retrieved ${models.length} models from API:`, models);
      return models;
    } catch (error) {
      throw new Error(`OpenAIProvider: Failed to get models - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async countTokens(messages: UniversalMessage[]): Promise<{ totalTokens: number }> {
    try {
      // Use tiktoken for accurate local token counting
      console.log(`[OpenAIProvider] Using tiktoken for token counting`);
      try {
        // Import tiktoken dynamically
        const tiktoken = await import('tiktoken');
        
        // Get the appropriate encoding for the model
        let encoding;
        const model = this.config.model.toLowerCase();
        
        if (model.includes('gpt-4') || model.includes('o1')) {
          encoding = tiktoken.encoding_for_model('gpt-4');
        } else if (model.includes('gpt-3.5')) {
          encoding = tiktoken.encoding_for_model('gpt-3.5-turbo');
        } else {
          // Default to cl100k_base encoding used by most OpenAI models
          encoding = tiktoken.get_encoding('cl100k_base');
        }
        
        // Convert messages to text and count tokens
        let totalTokens = 0;
        
        for (const message of messages) {
          // Count tokens for the message content
          totalTokens += encoding.encode(message.content).length;
          
          // Add overhead for message structure (role, metadata)
          totalTokens += 4; // Rough estimate for role and structure tokens
          
          // Add tokens for tool calls if present
          if (message.toolCalls && message.toolCalls.length > 0) {
            for (const toolCall of message.toolCalls) {
              const toolCallText = JSON.stringify({
                name: toolCall.name,
                arguments: toolCall.arguments
              });
              totalTokens += encoding.encode(toolCallText).length;
            }
          }
        }
        
        // Add system message overhead
        totalTokens += 3; // rough estimate for system message structure
        
        encoding.free(); // Clean up the encoding
        
        console.log(`[OpenAIProvider] Tiktoken counted ${totalTokens} tokens for ${messages.length} messages`);
        return { totalTokens };
        
      } catch (tiktokenError) {
        console.warn(`[OpenAIProvider] Tiktoken failed:`, tiktokenError);
        
        // Strategy 2: Character-based estimation as final fallback
        console.log(`[OpenAIProvider] Using character-based estimation as fallback`);
        
        let totalChars = 0;
        for (const message of messages) {
          totalChars += message.content.length;
          if (message.toolCalls) {
            for (const toolCall of message.toolCalls) {
              totalChars += JSON.stringify(toolCall).length;
            }
          }
        }
        
        // Rough estimation: 1 token ≈ 4 characters for English text
        const estimatedTokens = Math.ceil(totalChars / 4);
        console.log(`[OpenAIProvider] Estimated ${estimatedTokens} tokens from ${totalChars} characters`);
        return { totalTokens: estimatedTokens };
      }
    } catch (error) {
      console.error('[OpenAIProvider] Token counting failed:', error);
      return { totalTokens: 0 };
    }
  }

  setTools(): void {
    // OpenAI supports native tool calls, so we can store tool declarations for actual use
    if (this.configInstance) {
      const toolRegistry = this.configInstance.getToolRegistry();
      this.toolDeclarations = toolRegistry.getFunctionDeclarations();
      console.log(`[OpenAIProvider] Received ${this.toolDeclarations.length} tool declarations:`, 
        this.toolDeclarations.map(tool => tool.name));
    }
  }

  protected getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsSystemMessages: true,
      supportsImages: this.config.model.includes('vision') || this.config.model.includes('o1'),
      maxTokens: this.getMaxTokensForModel(),
      maxMessages: 1000
    };
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const apiKey = await this.getApiKey();
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  private convertToOpenAIMessages(messages: UniversalMessage[]): OpenAIMessage[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      tool_calls: msg.toolCalls?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments)
        }
      })),
      tool_call_id: msg.tool_call_id,
      name: msg.name
    }));
  }

  private convertFromOpenAIResponse(response: OpenAIResponse): UniversalResponse {
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
      case 'content_filter': return 'content_filter';
      default: return 'stop';
    }
  }

  private getMaxTokensForModel(): number {
    const model = this.config.model.toLowerCase();
    
    if (model.includes('gpt-4')) {
      return model.includes('32k') ? 32768 : 
             model.includes('turbo') ? 4096 : 8192;
    }
    if (model.includes('gpt-3.5')) {
      return model.includes('16k') ? 16384 : 4096;
    }
    if (model.includes('o1')) {
      return 128000;
    }
    
    return 4096;
  }

  async sendCompressionMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse> {
    const openaiMessages = this.convertToOpenAIMessages(messages);
    
    const requestBody: OpenAIRequestBody = {
      model: this.config.model,
      messages: openaiMessages,
      max_tokens: 4096,
      temperature: 0.7
      // Note: No tools added for compression requests
    };

    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      let errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.text();
        if (errorData) {
          errorMessage += ` - ${errorData}`;
        }
      } catch (parseError) {
        console.error('Error parsing OpenAI error response:', parseError);
      }
      throw this.createError(errorMessage);
    }

    const data = await response.json() as OpenAIResponse;
    
    return this.convertFromOpenAIResponse(data);
  }
}