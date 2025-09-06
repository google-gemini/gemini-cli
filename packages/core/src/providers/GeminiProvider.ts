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
  private googleAI?: GoogleGenAI;
  private generativeModel?: Models;
  private codeAssistServer?: any; // CodeAssistServer for OAuth

  constructor(config: ModelProviderConfig, configInstance?: Config) {
    super(config, configInstance);
    
    // Don't initialize GoogleGenAI in constructor - we'll create it dynamically with proper credentials
    this.googleAI = undefined;
    this.generativeModel = undefined;
    this.codeAssistServer = undefined;
  }

  /**
   * Get authentication headers based on user's preferred authentication method
   */
  private async getAuthHeaders(): Promise<{ [key: string]: string }> {
    try {
      const { AuthManager } = await import('../auth/AuthManager.js');
      const authManager = AuthManager.getInstance();
      if (this.configInstance) {
        authManager.setConfig(this.configInstance);
      }
      
      const credentials = await authManager.getAccessCredentials('gemini');
      
      if (credentials?.accessToken) {
        // User chose OAuth - use Bearer token
        return { 'Authorization': `Bearer ${credentials.accessToken}` };
      } else if (credentials?.apiKey) {
        // User chose API key - use x-goog-api-key header
        return { 'x-goog-api-key': credentials.apiKey };
      } else {
        throw new Error('No Gemini credentials available. Please authenticate first.');
      }
    } catch (error) {
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initialize GoogleGenAI client with proper credentials or OAuth client
   */
  private async initializeGoogleAI(): Promise<void> {
    try {
      const { AuthManager } = await import('../auth/AuthManager.js');
      const authManager = AuthManager.getInstance();
      if (this.configInstance) {
        authManager.setConfig(this.configInstance);
      }
      
      const credentials = await authManager.getAccessCredentials('gemini');
      
      if (credentials?.accessToken) {
        // User chose OAuth - use Code Assist Server pattern like CLI does
        console.log('[GeminiProvider] Initializing with OAuth via Code Assist Server');
        
        // Get OAuth client from AuthManager
        const oauthClient = await this.getOAuthClient();
        
        // Set up user data (project ID and tier) like CLI does
        const { setupUser } = await import('../code_assist/setup.js');
        const userData = await setupUser(oauthClient);
        
        console.log(`[GeminiProvider] User setup complete - Project ID: ${userData.projectId}, Tier: ${userData.userTier}`);
        
        // Create Code Assist Server for OAuth requests with proper user data
        const { CodeAssistServer } = await import('../code_assist/server.js');
        this.codeAssistServer = new CodeAssistServer(
          oauthClient,
          userData.projectId,
          { headers: { 'User-Agent': 'GeminiCLI-GUI/1.0.0' } },
          `gui_session_${Date.now()}`, // sessionId
          userData.userTier
        );
        
        // Don't use GoogleGenAI for OAuth, use CodeAssistServer instead
        this.googleAI = undefined;
        this.generativeModel = undefined;
      } else if (credentials?.apiKey) {
        // User chose API key - use GoogleGenAI client
        console.log('[GeminiProvider] Initializing GoogleGenAI with API key');
        this.googleAI = new GoogleGenAI({ 
          apiKey: credentials.apiKey 
        });
        this.generativeModel = this.googleAI.models;
        this.codeAssistServer = undefined;
      } else {
        throw new Error('No Gemini credentials available. Please authenticate first.');
      }
    } catch (error) {
      throw new Error(`Failed to initialize GoogleGenAI: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get OAuth client from AuthManager (similar to CLI pattern)
   */
  private async getOAuthClient(): Promise<any> {
    const { AuthManager } = await import('../auth/AuthManager.js');
    const authManager = AuthManager.getInstance();
    
    // Get the OAuth client that AuthManager has cached
    const authStatuses = (authManager as any).oauthClients;
    const oauthClient = authStatuses?.get('gemini');
    
    if (!oauthClient) {
      // If no cached client, create one using the same method as CLI
      const { getOauthClient } = await import('../code_assist/oauth2.js');
      const { AuthType } = await import('../core/contentGenerator.js');
      return await getOauthClient(AuthType.LOGIN_WITH_GOOGLE, this.configInstance!);
    }
    
    return oauthClient;
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
      // Get auth headers first
      const authHeaders = await this.getAuthHeaders();
      
      // Test with a simple API call
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models',
        {
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.ok;
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
      
      // Check for 429 quota exceeded errors
      if (this.is429QuotaError(error)) {
        const quotaError = this.createQuotaExceededError(error);
        throw quotaError;
      }
      
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
      
      // Check for 429 quota exceeded errors
      if (this.is429QuotaError(error)) {
        const quotaError = this.createQuotaExceededError(error);
        yield {
          type: 'error',
          error: quotaError
        };
        return;
      }
      
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


  async countTokens(messages: UniversalMessage[]): Promise<{ totalTokens: number }> {
    try {
      // Initialize authentication client (GoogleGenAI or CodeAssistServer)
      await this.initializeGoogleAI();
      
      // Convert messages to Gemini format
      const geminiData = this.convertToGeminiMessages(messages);
      
      // Use different counting approach based on authentication type
      if (this.codeAssistServer) {
        // OAuth authentication - use CodeAssistServer
        console.log('[GeminiProvider] Counting tokens using CodeAssistServer');
        const result = await this.codeAssistServer.countTokens({
          model: this.config.model,
          contents: geminiData.contents
        });
        return { totalTokens: result.totalTokens || 0 };
      } else if (this.generativeModel) {
        // API key authentication - use GoogleGenAI
        console.log('[GeminiProvider] Counting tokens using GoogleGenAI');
        const result = await this.generativeModel.countTokens({
          model: this.config.model,
          contents: geminiData.contents
        });
        return { totalTokens: result.totalTokens || 0 };
      } else {
        throw new Error('No authentication client available for token counting');
      }
    } catch (error) {
      console.error('[GeminiProvider] Token counting failed:', error);
      // Return 0 as fallback to prevent compression failures
      return { totalTokens: 0 };
    }
  }

  static async getAvailableModels(): Promise<string[]> {
    try {
      // Get auth headers from AuthManager
      const { AuthManager } = await import('../auth/AuthManager.js');
      const authManager = AuthManager.getInstance();
      
      const credentials = await authManager.getAccessCredentials('gemini');
      
      if (credentials?.accessToken) {
        // OAuth: Use predefined models (like CLI does)
        console.log('[GeminiProvider] Using OAuth - returning predefined model list');
        return await this.getPredefinedModels();
      } else if (credentials?.apiKey) {
        // API Key: Fetch from Google API
        console.log('[GeminiProvider] Using API key - fetching models from Google API');
        try {
          return await this.fetchModelsFromAPI({ 'x-goog-api-key': credentials.apiKey });
        } catch (apiError) {
          console.warn('[GeminiProvider] API fetch failed, using predefined models:', apiError);
          return await this.getPredefinedModels();
        }
      } else {
        // No authentication: return predefined models
        console.log('[GeminiProvider] No authentication - returning predefined model list');
        return await this.getPredefinedModels();
      }
    } catch (error) {
      console.warn('[GeminiProvider] Error in getAvailableModels, using predefined models:', error);
      return await this.getPredefinedModels();
    }
  }

  private static async getPredefinedModels(): Promise<string[]> {
    // Use the same models as CLI
    const { DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_FLASH_MODEL, DEFAULT_GEMINI_FLASH_LITE_MODEL } = await import('../config/models.js');
    return [
      DEFAULT_GEMINI_MODEL,           // 'gemini-2.5-pro'
      DEFAULT_GEMINI_FLASH_MODEL,     // 'gemini-2.5-flash' 
      DEFAULT_GEMINI_FLASH_LITE_MODEL, // 'gemini-2.5-flash-lite'
      // Add some additional commonly available models
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.0-pro'
    ];
  }

  private static async fetchModelsFromAPI(authHeaders: { [key: string]: string }): Promise<string[]> {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models',
      {
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GeminiProvider: HTTP error ${response.status}: ${response.statusText}`);
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
      throw new Error('GeminiProvider: No compatible models found in API response');
    }

    console.log(`GeminiProvider: Retrieved ${models.length} models from API:`, models);
    return models;
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
    
    // Note: We don't reinitialize clients here because we get credentials dynamically
    // from AuthManager in initializeGoogleAI(). The clients will be created as needed
    // with the correct authentication method (OAuth or API key) based on user preference.
    
    // Reset all clients if the model name changed
    // This forces reinitialization with the new model when needed
    if (config.model !== this.config.model) {
      this.googleAI = undefined;
      this.generativeModel = undefined;
      this.codeAssistServer = undefined;
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
    // Initialize authentication client (GoogleGenAI or CodeAssistServer)
    await this.initializeGoogleAI();
    
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
    
    // Use OAuth Code Assist Server or API key GoogleGenAI based on authentication type
    if (this.codeAssistServer) {
      // OAuth authentication - use CodeAssistServer
      console.log('[GeminiProvider] Using CodeAssistServer for OAuth request');
      return Promise.race([
        this.codeAssistServer.generateContent(requestWithSignal, `gui_${Date.now()}`),
        abortPromise
      ]);
    } else if (this.generativeModel) {
      // API key authentication - use GoogleGenAI
      console.log('[GeminiProvider] Using GoogleGenAI for API key request');
      return Promise.race([
        this.generativeModel.generateContent(requestWithSignal),
        abortPromise
      ]);
    } else {
      throw new Error('No authentication client available (neither OAuth nor API key)');
    }
  }
  
  private async generateContentStreamWithSignal(
    request: GenerateContentParameters, 
    signal: AbortSignal
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    // Initialize authentication client (GoogleGenAI or CodeAssistServer)
    await this.initializeGoogleAI();
    
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
    
    // Use OAuth Code Assist Server or API key GoogleGenAI based on authentication type
    if (this.codeAssistServer) {
      // OAuth authentication - use CodeAssistServer
      console.log('[GeminiProvider] Using CodeAssistServer for OAuth stream request');
      return Promise.race([
        this.codeAssistServer.generateContentStream(requestWithSignal, `gui_stream_${Date.now()}`),
        abortPromise
      ]);
    } else if (this.generativeModel) {
      // API key authentication - use GoogleGenAI
      console.log('[GeminiProvider] Using GoogleGenAI for API key stream request');
      return Promise.race([
        this.generativeModel.generateContentStream(requestWithSignal),
        abortPromise
      ]);
    } else {
      throw new Error('No authentication client available (neither OAuth nor API key)');
    }
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

  /**
   * Check if error is a 429 quota exceeded error
   */
  private is429QuotaError(error: unknown): boolean {
    // Check HTTP status 429
    if (error && typeof error === 'object') {
      // Handle Gaxios errors
      if ('status' in error && error.status === 429) {
        return true;
      }
      
      // Handle general errors with 429 status
      if ('code' in error && error.code === 429) {
        return true;
      }
      
      // Handle error messages containing quota information
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('429') || 
          message.toLowerCase().includes('quota exceeded') ||
          message.toLowerCase().includes('rate limit') ||
          message.toLowerCase().includes('too many requests')) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Create a user-friendly quota exceeded error with Flash model suggestion
   */
  private createQuotaExceededError(originalError: unknown): Error {
    const currentModel = this.config.model;
    const isUsingFlash = currentModel.toLowerCase().includes('flash');
    const isOAuth = this.codeAssistServer !== undefined;
    
    let message = '⚡ Quota exceeded for Gemini model';
    
    // Add model-specific information
    if (currentModel.toLowerCase().includes('pro')) {
      message += ' Pro';
    }
    
    message += '.\n\n';
    
    if (isUsingFlash) {
      // Already using Flash model
      message += 'You are already using the Flash model. ';
      if (isOAuth) {
        message += 'Consider upgrading your account for higher limits, or try again later.';
      } else {
        message += 'Please check your API key quota limits or try again later.';
      }
    } else {
      // Suggest switching to Flash model
      message += 'Recommendations:\n';
      message += '• Switch to a Flash model (e.g., gemini-2.5-flash) for higher quotas\n';
      message += '• Flash models are faster and have more generous rate limits\n';
      
      if (isOAuth) {
        message += '• Consider upgrading your Google Cloud account for Pro model access\n';
      } else {
        message += '• Check your API key quota settings in Google AI Studio\n';
      }
      
      message += '• Wait a few minutes and try again';
    }
    
    // Log the original error for debugging
    console.error('[GeminiProvider] Original quota error:', originalError);
    
    const quotaError = new Error(message);
    (quotaError as any).isQuotaError = true;
    (quotaError as any).originalError = originalError;
    (quotaError as any).currentModel = currentModel;
    (quotaError as any).isUsingFlash = isUsingFlash;
    
    return quotaError;
  }
  
}