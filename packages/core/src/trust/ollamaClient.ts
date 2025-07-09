/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from 'openai';
import { FunctionCall } from '@google/genai';

export interface OllamaConfig {
  baseUrl?: string;
  model?: string;
  timeout?: number;
  keepAlive?: string;
  numPredict?: number;
  temperature?: number;
  topP?: number;
  repeatPenalty?: number;
  seed?: number;
  concurrency?: number;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
        pattern?: string;
        minimum?: number;
        maximum?: number;
        items?: any;
      }>;
      required?: string[];
    };
  };
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface OllamaResponse {
  content: string;
  toolCalls: FunctionCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Ollama client using OpenAI-compatible API
 * Provides native tool calling capabilities for local models
 */
export class OllamaClient {
  private client: OpenAI;
  private model: string;
  private timeout: number;
  private keepAlive: string;
  private concurrency: number;
  private pendingRequests = new Map<string, Promise<any>>();
  private requestQueue: Array<() => Promise<any>> = [];
  private activeRequests = 0;

  constructor(config: OllamaConfig = {}) {
    this.model = config.model || 'qwen2.5:1.5b'; // Default to smaller, faster model
    this.timeout = config.timeout || 60000; // Reduced to 1 minute default
    this.keepAlive = config.keepAlive || '5m'; // Keep model loaded for 5 minutes
    this.concurrency = config.concurrency || 2; // Limit concurrent requests
    
    // Initialize OpenAI client with Ollama endpoint
    this.client = new OpenAI({
      baseURL: config.baseUrl || 'http://localhost:11434/v1',
      apiKey: 'ollama', // Dummy key for local Ollama
      timeout: this.timeout,
      maxRetries: 1, // Reduce retries for faster failure
    });
  }

  /**
   * Check if Ollama is running and accessible with timeout
   */
  async checkConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for health check
      
      const response = await fetch('http://localhost:11434/api/tags', {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * List available models from Ollama
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) {
        throw new Error('Failed to fetch models from Ollama');
      }
      
      const data = await response.json();
      return data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      console.error('Error listing Ollama models:', error);
      return [];
    }
  }

  /**
   * Check if a specific model is available (with caching)
   */
  private modelCache = new Map<string, { models: string[], timestamp: number }>();
  
  async isModelAvailable(modelName: string): Promise<boolean> {
    const cached = this.modelCache.get('models');
    const now = Date.now();
    
    // Use cached models if less than 30 seconds old
    if (cached && (now - cached.timestamp) < 30000) {
      return cached.models.includes(modelName);
    }
    
    const models = await this.listModels();
    this.modelCache.set('models', { models, timestamp: now });
    return models.includes(modelName);
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName: string, onProgress?: (progress: string) => void): Promise<boolean> {
    try {
      onProgress?.(`Pulling model ${modelName}...`);
      
      const response = await fetch('http://localhost:11434/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.statusText}`);
      }

      // Stream the pull progress
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const progress = JSON.parse(line);
              if (progress.status) {
                onProgress?.(progress.status);
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
      }

      onProgress?.(`Model ${modelName} pulled successfully`);
      return true;
    } catch (error) {
      console.error('Error pulling model:', error);
      onProgress?.(`Failed to pull model ${modelName}: ${error}`);
      return false;
    }
  }

  /**
   * Queue management for concurrent requests
   */
  private async executeWithConcurrency<T>(operation: () => Promise<T>): Promise<T> {
    // If we're at capacity, queue the request
    if (this.activeRequests >= this.concurrency) {
      return new Promise((resolve, reject) => {
        this.requestQueue.push(async () => {
          try {
            const result = await operation();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    // Execute immediately
    this.activeRequests++;
    try {
      const result = await operation();
      return result;
    } finally {
      this.activeRequests--;
      // Process next queued request
      const nextRequest = this.requestQueue.shift();
      if (nextRequest) {
        setImmediate(() => nextRequest());
      }
    }
  }

  /**
   * Generate a chat completion with tool calling support and concurrency management
   */
  async chatCompletion(
    messages: OllamaMessage[],
    tools?: ToolDefinition[],
    options: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    } = {}
  ): Promise<OllamaResponse> {
    return this.executeWithConcurrency(async () => {
      try {
        const completion = await this.client.chat.completions.create({
          model: this.model,
          messages: messages as any, // Type assertion for OpenAI compatibility
          tools: tools as any,
          tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
          temperature: options.temperature ?? 0.1,
          max_tokens: options.maxTokens ?? 1000, // Reduced for faster responses
          stream: false, // We'll handle streaming separately if needed
          // Note: Ollama-specific options handled via separate API calls
        });

      const choice = completion.choices[0];
      if (!choice) {
        throw new Error('No completion choice returned');
      }

      const content = choice.message.content || '';
      const toolCalls: FunctionCall[] = [];

      // Convert OpenAI tool calls to our FunctionCall format
      if (choice.message.tool_calls) {
        for (const toolCall of choice.message.tool_calls) {
          if (toolCall.type === 'function') {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              toolCalls.push({
                name: toolCall.function.name,
                args,
                id: toolCall.id,
              });
            } catch (error) {
              console.error('Error parsing tool call arguments:', error);
            }
          }
        }
      }

      return {
        content,
        toolCalls,
        finishReason: choice.finish_reason === 'tool_calls' ? 'tool_calls' : 
                     choice.finish_reason === 'length' ? 'length' :
                     choice.finish_reason === 'content_filter' ? 'content_filter' : 'stop',
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        } : undefined,
      };
      } catch (error) {
        console.error('Error in chat completion:', error);
        throw new Error(`Ollama chat completion failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  /**
   * Set the current model
   */
  setModel(modelName: string): void {
    this.model = modelName;
  }

  /**
   * Get the current model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Performance monitoring
   */
  private performanceMetrics = {
    requestCount: 0,
    totalLatency: 0,
    lastRequestTime: 0,
    averageLatency: 0,
  };

  private updateMetrics(latency: number): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.totalLatency += latency;
    this.performanceMetrics.lastRequestTime = Date.now();
    this.performanceMetrics.averageLatency = 
      this.performanceMetrics.totalLatency / this.performanceMetrics.requestCount;
  }

  /**
   * Preheat the model to improve first request performance
   */
  async preheatModel(): Promise<void> {
    try {
      const startTime = Date.now();
      await this.chatCompletion([
        { role: 'user', content: 'Hello' }
      ], [], { maxTokens: 1 });
      const latency = Date.now() - startTime;
      this.updateMetrics(latency);
      console.log(`✅ Model ${this.model} preheated (${latency}ms)`);
    } catch (error) {
      console.log(`⚠️  Model preheat failed: ${error}`);
    }
  }

  /**
   * Get client statistics and health info with performance metrics
   */
  async getStatus(): Promise<{
    connected: boolean;
    model: string;
    availableModels: string[];
    modelLoaded: boolean;
    performance: {
      requestCount: number;
      averageLatency: number;
      lastRequestTime: number;
      activeRequests: number;
      queuedRequests: number;
    };
  }> {
    const connected = await this.checkConnection();
    const availableModels = connected ? await this.listModels() : [];
    const modelLoaded = connected ? await this.isModelAvailable(this.model) : false;

    return {
      connected,
      model: this.model,
      availableModels,
      modelLoaded,
      performance: {
        requestCount: this.performanceMetrics.requestCount,
        averageLatency: this.performanceMetrics.averageLatency,
        lastRequestTime: this.performanceMetrics.lastRequestTime,
        activeRequests: this.activeRequests,
        queuedRequests: this.requestQueue.length,
      },
    };
  }

  /**
   * Create system prompt for tool guidance
   */
  createSystemPrompt(availableTools: ToolDefinition[]): string {
    const toolDescriptions = availableTools.map(tool => 
      `- ${tool.function.name}: ${tool.function.description}`
    ).join('\n');

    return `You are an AI assistant with access to tools for file operations, code analysis, and system tasks.

AVAILABLE TOOLS:
${toolDescriptions}

TOOL USAGE RULES:
1. Always use the appropriate tool for file operations instead of guessing content
2. Use read_file before writing to understand existing content
3. Use list_directory to explore project structure
4. Use shell_command for system operations (be careful and explain what you're doing)
5. Chain tools as needed to complete complex tasks
6. Always verify results when possible

BEHAVIOR:
- Think step-by-step and explain your reasoning
- Use tools to gather information before making assumptions
- Provide clear, concise responses
- Ask for clarification if the request is ambiguous
- Focus on the specific task and avoid unnecessary actions

Current working directory: ${process.cwd()}`;
  }
}