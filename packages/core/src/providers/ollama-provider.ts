/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseProvider } from './base-provider.js';
import type {
  ProviderConfig,
  ProviderInfo,
  ProviderModelInfo,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamChunk,
  ProviderTool,
  ProviderToolCall,
  ProviderFinishReason,
} from './types.js';
import { ProviderError } from './types.js';

/**
 * Ollama API types (based on Ollama REST API)
 */
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
  tools?: OllamaTool[];
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model?: string;
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaListResponse {
  models: OllamaModel[];
}

/**
 * Ollama provider implementation for local LLM inference
 */
export class OllamaProvider extends BaseProvider {
  readonly id = 'ollama' as const;
  readonly name = 'Ollama (Local)';
  readonly models = [
    'llama3.2',
    'llama3.2:1b',
    'llama3.2:3b',
    'llama3.1',
    'llama3.1:8b',
    'llama3.1:70b',
    'codellama',
    'codellama:13b',
    'codellama:34b',
    'mistral',
    'mixtral',
    'qwen2.5',
    'qwen2.5-coder',
    'deepseek-coder-v2',
    'phi3',
    'gemma2',
    'gemma2:27b',
  ];
  readonly defaultModel = 'llama3.2';

  private baseUrl: string = 'http://localhost:11434';

  protected async doInitialize(config: ProviderConfig): Promise<void> {
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    }

    // Verify Ollama is running
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama server returned ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ProviderError(
        `Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running? Error: ${message}`,
        this.id,
        'CONNECTION_ERROR',
      );
    }
  }

  async validateCredentials(): Promise<boolean> {
    this.ensureInitialized();
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<ProviderModelInfo[]> {
    this.ensureInitialized();

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      const data = (await response.json()) as OllamaListResponse;

      return data.models.map((model) => ({
        id: model.name,
        name: model.name,
        description: `${model.details.family} ${model.details.parameter_size} (${model.details.quantization_level})`,
        contextWindow: this.getContextWindow(model.name),
        maxOutputTokens: 4096,
        supportsTools: this.supportsTools(model.name),
        supportsVision: this.supportsVision(model.name),
      }));
    } catch (_error) {
      // Return static list as fallback
      return this.models.map((id) => ({
        id,
        name: id,
        description: `Ollama model: ${id}`,
        contextWindow: this.getContextWindow(id),
        maxOutputTokens: 4096,
        supportsTools: this.supportsTools(id),
        supportsVision: this.supportsVision(id),
      }));
    }
  }

  getInfo(): ProviderInfo {
    return {
      id: this.id,
      name: this.name,
      description:
        'Local LLM inference with Ollama - run models on your own hardware',
      models: this.getStaticModelInfo(),
      defaultModel: this.defaultModel,
      supportsStreaming: true,
      supportsTools: true,
      supportsVision: true,
      requiresApiKey: false,
    };
  }

  private getStaticModelInfo(): ProviderModelInfo[] {
    return this.models.map((id) => ({
      id,
      name: id,
      description: `Ollama model: ${id}`,
      contextWindow: this.getContextWindow(id),
      maxOutputTokens: 4096,
      supportsTools: this.supportsTools(id),
      supportsVision: this.supportsVision(id),
    }));
  }

  async generateContent(request: ProviderRequest): Promise<ProviderResponse> {
    this.ensureInitialized();

    const model = this.getCurrentModel(request.model);
    const ollamaRequest = this.convertRequest(request, model, false);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaRequest),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${error}`);
      }

      const data = (await response.json()) as OllamaChatResponse;
      return this.convertResponse(data, model);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async *generateContentStream(
    request: ProviderRequest,
  ): AsyncGenerator<ProviderStreamChunk> {
    this.ensureInitialized();

    const model = this.getCurrentModel(request.model);
    const ollamaRequest = this.convertRequest(request, model, true);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaRequest),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${error}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let accumulatedText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete JSON lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line) as OllamaChatResponse;

            if (data.message?.content) {
              accumulatedText += data.message.content;
              yield {
                delta: data.message.content,
                text: accumulatedText,
                isFinal: false,
              };
            }

            if (data.done) {
              // Extract tool calls if present
              const toolCalls = data.message?.tool_calls
                ? this.extractToolCalls(data.message.tool_calls)
                : undefined;

              yield {
                text: accumulatedText,
                isFinal: true,
                finishReason: this.convertDoneReason(data.done_reason),
                toolCalls,
                usage: {
                  inputTokens: data.prompt_eval_count || 0,
                  outputTokens: data.eval_count || 0,
                },
              };
              return;
            }
          } catch {
            // Invalid JSON line, skip
          }
        }
      }

      // Final yield if no explicit done
      yield {
        text: accumulatedText,
        isFinal: true,
        finishReason: 'stop',
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async countTokens(content: string, _model?: string): Promise<number> {
    // Ollama doesn't have a token counting endpoint
    // Use rough approximation: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Convert provider-agnostic request to Ollama format
   */
  private convertRequest(
    request: ProviderRequest,
    model: string,
    stream: boolean,
  ): OllamaChatRequest {
    const messages: OllamaMessage[] = [];

    // Add system message if provided
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    // Convert messages
    for (const msg of request.messages) {
      if (msg.role === 'system') {
        messages.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        const ollamaMsg: OllamaMessage = {
          role: 'assistant',
          content: msg.content,
        };

        // Add tool calls if present
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          ollamaMsg.tool_calls = msg.toolCalls.map((tc) => ({
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          }));
        }

        messages.push(ollamaMsg);
      }

      // Handle tool results
      if (msg.toolResults) {
        for (const result of msg.toolResults) {
          messages.push({
            role: 'tool',
            content: result.content,
          });
        }
      }
    }

    const ollamaRequest: OllamaChatRequest = {
      model,
      messages,
      stream,
    };

    // Add options
    if (
      request.temperature !== undefined ||
      request.topP !== undefined ||
      request.topK !== undefined ||
      request.maxTokens !== undefined ||
      request.stopSequences
    ) {
      ollamaRequest.options = {
        temperature: request.temperature,
        top_p: request.topP,
        top_k: request.topK,
        num_predict: request.maxTokens,
        stop: request.stopSequences,
      };
    }

    // Add tools if provided and model supports them
    if (request.tools && request.tools.length > 0) {
      ollamaRequest.tools = this.convertTools(request.tools);
    }

    return ollamaRequest;
  }

  /**
   * Convert provider-agnostic tools to Ollama format
   */
  private convertTools(tools: ProviderTool[]): OllamaTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Extract tool calls from Ollama response
   */
  private extractToolCalls(
    ollamaToolCalls: OllamaToolCall[],
  ): ProviderToolCall[] {
    return ollamaToolCalls.map((tc, index) => ({
      id: `call_${index}`,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));
  }

  /**
   * Convert Ollama done reason to provider finish reason
   */
  private convertDoneReason(doneReason?: string): ProviderFinishReason {
    switch (doneReason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      default:
        return 'stop';
    }
  }

  /**
   * Convert Ollama response to provider-agnostic format
   */
  private convertResponse(
    response: OllamaChatResponse,
    model: string,
  ): ProviderResponse {
    const text = response.message?.content || '';

    // Extract tool calls
    const toolCalls = response.message?.tool_calls
      ? this.extractToolCalls(response.message.tool_calls)
      : undefined;

    return {
      content: text,
      model,
      usage: {
        inputTokens: response.prompt_eval_count || 0,
        outputTokens: response.eval_count || 0,
      },
      finishReason: this.convertDoneReason(response.done_reason),
      toolCalls,
      raw: response,
    };
  }

  /**
   * Get context window size for a model
   */
  private getContextWindow(model: string): number {
    // Common context window sizes
    if (model.includes('llama3')) return 128000;
    if (model.includes('codellama')) return 16384;
    if (model.includes('mistral')) return 32768;
    if (model.includes('mixtral')) return 32768;
    if (model.includes('qwen')) return 32768;
    if (model.includes('deepseek')) return 64000;
    if (model.includes('phi')) return 128000;
    if (model.includes('gemma')) return 8192;
    return 4096; // Default fallback
  }

  /**
   * Check if model supports tools
   */
  private supportsTools(model: string): boolean {
    // Most modern models support tools
    if (model.includes('llama3')) return true;
    if (model.includes('mistral')) return true;
    if (model.includes('mixtral')) return true;
    if (model.includes('qwen')) return true;
    if (model.includes('phi')) return true;
    return false;
  }

  /**
   * Check if model supports vision
   */
  private supportsVision(model: string): boolean {
    if (model.includes('llava')) return true;
    if (model.includes('bakllava')) return true;
    if (model.includes('llama3.2') && model.includes('vision')) return true;
    return false;
  }

  /**
   * Handle and convert Ollama errors to provider errors
   */
  private handleError(error: unknown): ProviderError {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes('ECONNREFUSED') ||
      message.includes('CONNECTION_ERROR')
    ) {
      return new ProviderError(
        `Cannot connect to Ollama at ${this.baseUrl}. Is Ollama running?`,
        this.id,
        'CONNECTION_ERROR',
        undefined,
        true,
      );
    }

    if (message.includes('model') && message.includes('not found')) {
      return new ProviderError(
        `Ollama model not found. Run 'ollama pull <model>' to download it.`,
        this.id,
        'MODEL_NOT_FOUND',
        404,
        false,
      );
    }

    return new ProviderError(
      `Ollama error: ${message}`,
      this.id,
      'UNKNOWN_ERROR',
    );
  }
}
