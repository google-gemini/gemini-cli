/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensResponse,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  FunctionCall,
} from '@google/genai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { OllamaClient, OllamaConfig, OllamaMessage, ToolDefinition } from './ollamaClient.js';
import { OllamaToolRegistry } from './ollamaToolRegistry.js';

export interface OllamaContentGeneratorConfig extends OllamaConfig {
  maxToolCalls?: number;
  enableToolCalling?: boolean;
  preferredModels?: string[];
  autoModelSelection?: boolean;
}

/**
 * Ollama-based content generator with native tool calling support
 * Replaces the complex node-llama-cpp approach with OpenAI-compatible API
 */
export class OllamaContentGenerator implements ContentGenerator {
  private ollamaClient: OllamaClient;
  private toolRegistry: OllamaToolRegistry;
  private config: Config;
  private trustToolRegistry: ToolRegistry;
  private maxToolCalls: number;
  private enableToolCalling: boolean;
  private conversationHistory: OllamaMessage[] = [];

  constructor(
    config: Config,
    trustToolRegistry: ToolRegistry,
    ollamaConfig: OllamaContentGeneratorConfig = {}
  ) {
    this.config = config;
    this.trustToolRegistry = trustToolRegistry;
    this.maxToolCalls = ollamaConfig.maxToolCalls || 5;
    this.enableToolCalling = ollamaConfig.enableToolCalling ?? true;

    // Initialize Ollama client
    this.ollamaClient = new OllamaClient(ollamaConfig);
    
    // Initialize tool registry
    this.toolRegistry = new OllamaToolRegistry(config, trustToolRegistry);
  }

  /**
   * Initialize the content generator
   */
  async initialize(): Promise<void> {
    // Check if Ollama is running
    const isConnected = await this.ollamaClient.checkConnection();
    if (!isConnected) {
      throw new Error('Ollama is not running. Please start Ollama with: ollama serve');
    }

    // Check if current model is available
    const currentModel = this.ollamaClient.getModel();
    const isModelAvailable = await this.ollamaClient.isModelAvailable(currentModel);
    
    if (!isModelAvailable) {
      console.log(`Model ${currentModel} not found. Attempting to pull...`);
      const pullSuccess = await this.ollamaClient.pullModel(currentModel, (progress) => {
        console.log(`Pull progress: ${progress}`);
      });
      
      if (!pullSuccess) {
        throw new Error(`Failed to pull model ${currentModel}. Please run: ollama pull ${currentModel}`);
      }
    }

    // Initialize system prompt
    const systemPrompt = this.ollamaClient.createSystemPrompt(
      this.enableToolCalling ? this.toolRegistry.getToolDefinitions() : []
    );
    
    this.conversationHistory = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    // Preheat the model for better performance
    console.log(`🔥 Preheating model ${currentModel}...`);
    await this.ollamaClient.preheatModel();

    console.log(`✅ Ollama Content Generator initialized with model: ${currentModel}`);
  }

  /**
   * Generate content with tool calling support
   */
  async generateContent(request: GenerateContentParameters): Promise<GenerateContentResponse> {
    try {
      // Convert Gemini request to Ollama format
      const messages = this.convertGeminiToOllamaMessages(request);
      
      // Add messages to conversation history
      this.conversationHistory.push(...messages);

      // Execute tool calling loop
      const finalResponse = await this.executeToolCallingLoop();

      // Convert back to Gemini format
      return this.convertOllamaToGeminiResponse(finalResponse);
    } catch (error) {
      console.error('Error in generateContent:', error);
      
      // Return error response in Gemini format
      return {
        candidates: [
          {
            content: {
              parts: [{ text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
              role: 'model',
            },
            finishReason: 'OTHER' as any,
            index: 0,
          },
        ],
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      } as GenerateContentResponse;
    }
  }

  /**
   * Execute the tool calling loop with chain management
   */
  private async executeToolCallingLoop(): Promise<{
    content: string;
    toolCalls: FunctionCall[];
  }> {
    let toolCallCount = 0;
    let finalContent = '';
    let allToolCalls: FunctionCall[] = [];

    while (toolCallCount < this.maxToolCalls) {
      // Get tools for this request
      const tools = this.enableToolCalling ? this.toolRegistry.getToolDefinitions() : undefined;

      // Generate completion
      const response = await this.ollamaClient.chatCompletion(
        this.conversationHistory,
        tools,
        {
          temperature: 0.1,
          maxTokens: 2000,
        }
      );

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls.map(tc => ({
          id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function' as const,
          function: {
            name: tc.name || 'unknown',
            arguments: JSON.stringify(tc.args || {}),
          },
        })),
      });

      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        finalContent = response.content;
        break;
      }

      // Execute tool calls
      const toolResults: string[] = [];
      for (const toolCall of response.toolCalls) {
        try {
          console.log(`Executing tool: ${toolCall.name} with args:`, toolCall.args);
          
          const result = await this.toolRegistry.executeTool(toolCall.name || 'unknown', toolCall.args || {});
          
          if (result.success) {
            toolResults.push(result.result);
            allToolCalls.push(toolCall);
          } else {
            toolResults.push(`Error: ${result.error}`);
          }

          // Add tool result to conversation history
          this.conversationHistory.push({
            role: 'tool',
            content: result.success ? result.result : `Error: ${result.error}`,
            tool_call_id: toolCall.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: toolCall.name || 'unknown',
          });
        } catch (error) {
          const errorMsg = `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMsg);
          
          toolResults.push(`Error: ${errorMsg}`);
          
          // Add error to conversation history
          this.conversationHistory.push({
            role: 'tool',
            content: errorMsg,
            tool_call_id: toolCall.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: toolCall.name || 'unknown',
          });
        }
      }

      toolCallCount++;
      
      // Continue the loop to let the model process tool results
      console.log(`Tool call ${toolCallCount}/${this.maxToolCalls} completed`);
    }

    if (toolCallCount >= this.maxToolCalls) {
      console.warn(`Maximum tool calls (${this.maxToolCalls}) reached`);
      finalContent = finalContent || 'Maximum tool calls reached. Task may be incomplete.';
    }

    return {
      content: finalContent,
      toolCalls: allToolCalls,
    };
  }

  /**
   * Convert Gemini request to Ollama messages
   */
  private convertGeminiToOllamaMessages(request: GenerateContentParameters): OllamaMessage[] {
    const messages: OllamaMessage[] = [];

    if ('contents' in request && request.contents) {
      const contentArray = Array.isArray(request.contents) ? request.contents : [request.contents];
      for (const content of contentArray) {
        // Check if content is a Content object with role and parts
        if (typeof content === 'object' && content !== null && 'role' in content && 'parts' in content) {
          if (content.role === 'user') {
            const textParts = content.parts?.filter((part: any) => part.text) || [];
            if (textParts.length > 0) {
              messages.push({
                role: 'user',
                content: textParts.map((part: any) => part.text).join('\n'),
              });
            }
          }
        }
      }
    }

    return messages;
  }

  /**
   * Convert Ollama response to Gemini format
   */
  private convertOllamaToGeminiResponse(response: {
    content: string;
    toolCalls: FunctionCall[];
  }): GenerateContentResponse {
    const parts: Part[] = [];
    
    // Add text content
    if (response.content.trim()) {
      parts.push({ text: response.content });
    }

    // Add function calls
    for (const toolCall of response.toolCalls) {
      parts.push({ functionCall: toolCall });
    }

    return {
      candidates: [
        {
          content: {
            parts: parts.length > 0 ? parts : [{ text: response.content }],
            role: 'model',
          },
          finishReason: 'STOP' as any,
          index: 0,
        },
      ],
      text: response.content,
      functionCalls: response.toolCalls,
    } as GenerateContentResponse;
  }

  /**
   * Count tokens (placeholder implementation)
   */
  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Ollama doesn't provide token counting, so we'll estimate
    const text = JSON.stringify(request);
    const estimatedTokens = Math.ceil(text.length / 4); // Rough estimate

    return {
      totalTokens: estimatedTokens,
    };
  }

  /**
   * Generate content stream (placeholder implementation)
   */
  async generateContentStream(request: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>> {
    // For now, return a single response as a stream
    const response = await this.generateContent(request);
    return (async function*() {
      yield response;
    })();
  }

  /**
   * Embed content (not supported by Ollama)
   */
  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Embedding not supported by Ollama content generator');
  }

  /**
   * Get current model information with performance metrics
   */
  async getModelInfo(): Promise<{
    model: string;
    connected: boolean;
    availableModels: string[];
    performance?: {
      requestCount: number;
      averageLatency: number;
      lastRequestTime: number;
      activeRequests: number;
      queuedRequests: number;
    };
  }> {
    const status = await this.ollamaClient.getStatus();
    return {
      model: status.model,
      connected: status.connected,
      availableModels: status.availableModels,
      performance: status.performance,
    };
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<{
    requestCount: number;
    averageLatency: number;
    lastRequestTime: number;
    activeRequests: number;
    queuedRequests: number;
  }> {
    const status = await this.ollamaClient.getStatus();
    return status.performance;
  }

  /**
   * Switch to a different model
   */
  async switchModel(modelName: string): Promise<void> {
    const isAvailable = await this.ollamaClient.isModelAvailable(modelName);
    if (!isAvailable) {
      console.log(`Model ${modelName} not available. Attempting to pull...`);
      const pullSuccess = await this.ollamaClient.pullModel(modelName, (progress) => {
        console.log(`Pull progress: ${progress}`);
      });
      
      if (!pullSuccess) {
        throw new Error(`Failed to pull model ${modelName}`);
      }
    }

    this.ollamaClient.setModel(modelName);
    console.log(`Switched to model: ${modelName}`);
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): OllamaMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear conversation history
   */
  clearConversationHistory(): void {
    const systemMessage = this.conversationHistory.find(m => m.role === 'system');
    this.conversationHistory = systemMessage ? [systemMessage] : [];
  }

  /**
   * Get tool registry for inspection
   */
  getToolRegistry(): OllamaToolRegistry {
    return this.toolRegistry;
  }
}