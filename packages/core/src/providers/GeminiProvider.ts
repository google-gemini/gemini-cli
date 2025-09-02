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
import { GoogleGenAI } from '@google/genai';
import type { 
  Content,
  GenerateContentResponse,
  GenerateContentParameters,
  Models,
  GenerateContentConfig
} from '@google/genai';


export class GeminiProvider extends BaseModelProvider {
  private googleAI: GoogleGenAI;
  private generativeModel: Models;

  constructor(config: ModelProviderConfig, configInstance?: Config) {
    super(config, configInstance);
    
    if (!config.apiKey) {
      throw new Error('API key is required for Gemini provider');
    }
    
    // Initialize Google AI client - following contentGenerator.ts pattern
    this.googleAI = new GoogleGenAI({ apiKey: config.apiKey });
    this.generativeModel = this.googleAI.models;
  }

  async initialize(): Promise<void> {
    // Initialize tools if available
    if (this.configInstance) {
      this.setTools();
    }
    return Promise.resolve();
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test with a minimal message using the generative model
      const result = await this.generativeModel.generateContent({
        model: this.config.model,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
        config: {}
      });
      return !!result;
    } catch (error) {
      console.error('Gemini connection test failed:', error);
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
        error: isConnected ? undefined : 'Failed to connect to Gemini API'
      };
    } catch (error) {
      return {
        status: 'error',
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown Gemini error'
      };
    }
  }

  async sendMessage(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): Promise<UniversalResponse> {
    try {
      const geminiData = this.convertToGeminiMessages(messages);
      const request = this.buildGenerateContentRequest(geminiData);
      
      // Generate content with abort signal support
      const result = await this.generateContentWithSignal(request, signal);
      
      let fullContent = '';
      const toolCalls: ToolCall[] = [];
      
      // Process response parts
      if (result.candidates?.[0]?.content?.parts) {
        for (const part of result.candidates[0].content.parts) {
          if (part.text) {
            fullContent += part.text;
          } else if (part.functionCall) {
            toolCalls.push({
              id: `gemini_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: part.functionCall.name!,
              arguments: part.functionCall.args || {}
            });
          }
        }
      }
      
      return {
        content: fullContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: this.mapFinishReason(result.candidates?.[0]?.finishReason),
        model: this.config.model
      };
    } catch (error) {
      // Log detailed error information for debugging
      console.error(`[GeminiProvider] sendMessage failed:`, error);
      
      // If it's a 400 error related to function calls, log the request details
      if (error instanceof Error && error.message.includes('function response parts') || 
          error instanceof Error && error.message.includes('function call parts')) {
        console.error(`[GeminiProvider] Function call/response mismatch error detected`);
        console.error(`[GeminiProvider] Original messages count: ${messages.length}`);
        messages.forEach((msg, index) => {
          console.error(`  Message[${index}]: role=${msg.role}, hasToolCalls=${!!msg.toolCalls}, toolCallsCount=${msg.toolCalls?.length || 0}, tool_call_id=${msg.tool_call_id || 'none'}`);
        });
      }
      
      throw this.createError('Failed to send message to Gemini', error);
    }
  }

  async *sendMessageStream(
    messages: UniversalMessage[],
    signal: AbortSignal
  ): AsyncGenerator<UniversalStreamEvent> {
    try {
      const geminiData = this.convertToGeminiMessages(messages);
      const request = this.buildGenerateContentRequest(geminiData);
      
      // Generate content stream with abort signal support
      const streamResult = await this.generateContentStreamWithSignal(request, signal);
      
      let fullContent = '';
      const toolCalls: ToolCall[] = [];
      
      // Process stream
      for await (const chunk of streamResult) {
        if (signal.aborted) {
          yield { type: 'error', error: new Error('Request aborted') };
          return;
        }
        
        const candidate = chunk.candidates?.[0];
        if (!candidate?.content?.parts) continue;
        
        for (const part of candidate.content.parts) {
          if (part.text) {
            fullContent += part.text;
            yield {
              type: 'content',
              content: part.text
            };
          } else if (part.functionCall) {
            const toolCall: ToolCall = {
              id: `gemini_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: part.functionCall.name!,
              arguments: part.functionCall.args || {}
            };
            toolCalls.push(toolCall);
            
            yield {
              type: 'tool_call',
              toolCall
            };
          }
        }
      }
      
      // Final response - stream is done, yield final response
      yield {
        type: 'done',
        response: {
          content: fullContent,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          finishReason: 'stop',
          model: this.config.model
        }
      };
    } catch (error) {
      // Log detailed error information for debugging
      console.error(`[GeminiProvider] sendMessageStream failed:`, error);
      
      // If it's a 400 error related to function calls, log the request details
      if (error instanceof Error && error.message.includes('function response parts') || 
          error instanceof Error && error.message.includes('function call parts')) {
        console.error(`[GeminiProvider] Function call/response mismatch error detected in stream`);
        console.error(`[GeminiProvider] Original messages count: ${messages.length}`);
        messages.forEach((msg, index) => {
          console.error(`  Message[${index}]: role=${msg.role}, hasToolCalls=${!!msg.toolCalls}, toolCallsCount=${msg.toolCalls?.length || 0}, tool_call_id=${msg.tool_call_id || 'none'}`);
        });
      }
      
      yield {
        type: 'error',
        error: this.createError('Gemini stream error', error)
      };
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      // Use Google AI REST API to fetch available models dynamically
      const apiKey = this.config.apiKey;
      if (!apiKey || apiKey === '') {
        console.warn('GeminiProvider: No API key available, using fallback models');
        return this.getFallbackModels();
      }

      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models',
        {
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const models = [];

      if (data.models && Array.isArray(data.models)) {
        for (const model of data.models) {
          // Check if the model supports generateContent
          if (model.supportedGenerationMethods?.includes('generateContent')) {
            // Extract model name from full name (e.g., "models/gemini-1.5-pro" -> "gemini-1.5-pro")
            const modelName = model.name.replace('models/', '');
            models.push(modelName);
          }
        }
      }

      if (models.length === 0) {
        console.warn('GeminiProvider: No models found from API, using fallback models');
        return this.getFallbackModels();
      }

      console.log(`GeminiProvider: Retrieved ${models.length} models from API:`, models);
      return models;
    } catch (error) {
      console.error('GeminiProvider: Failed to fetch models from API:', error);
      console.warn('GeminiProvider: Using fallback models due to API error');
      return this.getFallbackModels();
    }
  }

  private getFallbackModels(): string[] {
    return [
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro-002'
    ];
  }

  setTools(): void {
    if (!this.configInstance) return;
    
    const toolRegistry = this.configInstance.getToolRegistry();
    this.toolDeclarations = toolRegistry.getFunctionDeclarations();
    console.log(`[GeminiProvider] Loaded ${this.toolDeclarations.length} tool declarations:`, 
      this.toolDeclarations.map(tool => tool.name));
  }

  override updateConfig(config: ModelProviderConfig): void {
    super.updateConfig(config);
    
    // Reinitialize GoogleGenAI client if API key changed
    if (config.apiKey !== this.config.apiKey) {
      this.googleAI = new GoogleGenAI({ apiKey: config.apiKey });
    }
    
    // Update generative model if model changed
    if (config.model !== this.config.model || config.apiKey !== this.config.apiKey) {
      this.generativeModel = this.googleAI.models;
    }
  }

  protected getCapabilities(): ProviderCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsSystemMessages: true,
      supportsImages: true,
      maxTokens: this.getMaxTokensForModel(),
      maxMessages: 1000
    };
  }


  private getMaxTokensForModel(): number {
    const model = this.config.model.toLowerCase();
    
    if (model.includes('2.5')) return 1048576;
    if (model.includes('1.5-pro')) return 2097152;
    if (model.includes('1.5-flash')) return 1048576;
    
    return 32768;
  }

  // New helper methods for independent functionality
  
  private convertToGeminiMessages(messages: UniversalMessage[]): { contents: Content[], systemInstruction?: string } {
    const contents: Content[] = [];
    let systemInstruction = '';
    
    // Extract system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    if (systemMessages.length > 0) {
      systemInstruction = systemMessages.map(m => m.content).join('\n\n');
    }
    
    // Convert conversation messages
    for (const msg of messages.filter(m => m.role !== 'system')) {
      if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }]
        });
      } else if (msg.role === 'assistant') {
        const parts: any[] = [];
        
        // Add text content if present
        if (msg.content && msg.content.trim()) {
          parts.push({ text: msg.content });
        }
        
        // Add tool calls as function calls if present
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const toolCall of msg.toolCalls) {
            parts.push({
              functionCall: {
                id: toolCall.id,
                name: toolCall.name,
                args: toolCall.arguments
              }
            });
          }
        }
        
        // Only add the message if we have parts
        if (parts.length > 0) {
          contents.push({
            role: 'model',
            parts: parts
          });
        }
      } else if (msg.role === 'tool') {
        // Tool responses should be handled as function responses from user role
        // Check if this is a Gemini-formatted function response
        try {
          const parsedContent = JSON.parse(msg.content);
          if (parsedContent.__gemini_function_response) {
            contents.push({
              role: 'user',
              parts: [{
                functionResponse: parsedContent.__gemini_function_response
              }]
            });
          } else {
            // Standard tool response
            contents.push({
              role: 'user',
              parts: [{
                functionResponse: {
                  id: msg.tool_call_id || 'unknown_id',
                  name: msg.name || 'unknown',
                  response: parsedContent
                }
              }]
            });
          }
        } catch {
          // Not JSON, treat as plain text response
          contents.push({
            role: 'user',
            parts: [{
              functionResponse: {
                id: msg.tool_call_id || 'unknown_id',
                name: msg.name || 'unknown',
                response: { result: msg.content }
              }
            }]
          });
        }
      }
    }
    
    // Debug logging for function call/response matching
    console.log(`[GeminiProvider] Generated ${contents.length} contents for API request`);
    
    let functionCallCount = 0;
    let functionResponseCount = 0;
    
    contents.forEach((content, index) => {
      const functionCalls = content.parts?.filter(part => part.functionCall) || [];
      const functionResponses = content.parts?.filter(part => part.functionResponse) || [];
      
      if (functionCalls.length > 0) {
        functionCallCount += functionCalls.length;
        console.log(`[GeminiProvider] Content[${index}] (role: ${content.role}) has ${functionCalls.length} functionCall(s):`);
        functionCalls.forEach((part, partIndex) => {
          console.log(`  - functionCall[${partIndex}]: name="${part.functionCall?.name}", id="${part.functionCall?.id}"`);
        });
      }
      
      if (functionResponses.length > 0) {
        functionResponseCount += functionResponses.length;
        console.log(`[GeminiProvider] Content[${index}] (role: ${content.role}) has ${functionResponses.length} functionResponse(s):`);
        functionResponses.forEach((part, partIndex) => {
          console.log(`  - functionResponse[${partIndex}]: name="${part.functionResponse?.name}", id="${part.functionResponse?.id}"`);
        });
      }
      
      if (content.parts && content.parts.length > 0) {
        const partTypes = content.parts.map(part => {
          if (part.text) return 'text';
          if (part.functionCall) return 'functionCall';
          if (part.functionResponse) return 'functionResponse';
          return 'other';
        }).join(', ');
        console.log(`[GeminiProvider] Content[${index}] (role: ${content.role}) parts: [${partTypes}]`);
      }
    });
    
    console.log(`[GeminiProvider] Total function calls: ${functionCallCount}, Total function responses: ${functionResponseCount}`);
    
    if (functionCallCount !== functionResponseCount && (functionCallCount > 0 || functionResponseCount > 0)) {
      console.warn(`[GeminiProvider] ⚠️  Function call/response count mismatch! Calls: ${functionCallCount}, Responses: ${functionResponseCount}`);
      console.warn(`[GeminiProvider] This may cause the 400 error from Gemini API`);
    }
    
    return { contents, systemInstruction: systemInstruction || undefined };
  }
  
  private buildGenerateContentRequest(geminiData: { contents: Content[], systemInstruction?: string }): GenerateContentParameters {
    const config: GenerateContentConfig = {
      temperature: 0.7,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 4096
    };
    
    // Add system instruction
    if (geminiData.systemInstruction) {
      config.systemInstruction = {
        role: 'user',
        parts: [{ text: geminiData.systemInstruction }]
      };
    }
    
    // Add tools if available
    if (this.toolDeclarations && this.toolDeclarations.length > 0) {
      config.tools = [{
        functionDeclarations: this.toolDeclarations
          .filter(tool => tool.name && tool.description) // Filter out invalid tools
          .map(tool => {
            // Clean and validate parameters schema for Gemini API
            const params = this.sanitizeParametersSchema(tool.parametersJsonSchema || {});
            return {
              name: tool.name!,
              description: tool.description!,
              parameters: params
            };
          })
      }];
    }
    
    return {
      model: this.config.model,
      contents: geminiData.contents,
      config
    };
  }
  
  private async generateContentWithSignal(
    request: GenerateContentParameters, 
    signal: AbortSignal
  ): Promise<GenerateContentResponse> {
    // Create a promise that rejects when the signal is aborted
    const abortPromise = new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(new Error('Request aborted'));
        return;
      }
      signal.addEventListener('abort', () => reject(new Error('Request aborted')));
    });
    
    // Add abort signal to config
    const requestWithSignal: GenerateContentParameters = {
      ...request,
      config: {
        ...request.config,
        abortSignal: signal
      }
    };
    
    // Race the generation against the abort signal
    return Promise.race([
      this.generativeModel.generateContent(requestWithSignal),
      abortPromise
    ]);
  }
  
  private async generateContentStreamWithSignal(
    request: GenerateContentParameters, 
    signal: AbortSignal
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // Create a promise that rejects when the signal is aborted
    const abortPromise = new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(new Error('Request aborted'));
        return;
      }
      signal.addEventListener('abort', () => reject(new Error('Request aborted')));
    });
    
    // Add abort signal to config
    const requestWithSignal: GenerateContentParameters = {
      ...request,
      config: {
        ...request.config,
        abortSignal: signal
      }
    };
    
    // Race the generation against the abort signal
    return Promise.race([
      this.generativeModel.generateContentStream(requestWithSignal),
      abortPromise
    ]);
  }
  
  private mapFinishReason(reason?: string): UniversalResponse['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
        return 'content_filter';
      case 'OTHER':
      default:
        return 'stop';
    }
  }

  /**
   * Sanitize parameters schema for Gemini API compatibility
   * Gemini API has stricter requirements for nested array schemas
   */
  private sanitizeParametersSchema(schema: unknown): Record<string, unknown> {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return { type: 'object', properties: {} };
    }

    const sanitized = JSON.parse(JSON.stringify(schema));

    // Recursively fix array schemas that might have missing 'items' fields
    const fixArraySchema = (obj: any): void => {
      if (typeof obj !== 'object' || !obj) return;

      if (Array.isArray(obj)) {
        obj.forEach(fixArraySchema);
        return;
      }

      for (const [, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value) {
          const schemaValue = value as any;
          
          // If it's an array type but missing items, add empty items schema
          if (schemaValue.type === 'array' && !schemaValue.items) {
            schemaValue.items = { type: 'string' }; // Default to string type
          }
          
          // If items itself is an array type but missing nested items, fix it
          if (schemaValue.items && schemaValue.items.type === 'array' && !schemaValue.items.items) {
            schemaValue.items.items = { type: 'string' }; // Default nested items
          }
          
          fixArraySchema(schemaValue);
        }
      }
    };

    fixArraySchema(sanitized);

    // Ensure the root is always an object schema
    if (!sanitized.type) {
      sanitized.type = 'object';
    }
    if (sanitized.type === 'object' && !sanitized.properties) {
      sanitized.properties = {};
    }

    return sanitized as Record<string, unknown>;
  }
  
}