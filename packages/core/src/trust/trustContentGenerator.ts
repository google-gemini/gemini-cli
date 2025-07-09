/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
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
  FunctionCall,
} from '@google/genai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { TrustNodeLlamaClient } from './nodeLlamaClient.js';
import { TrustModelManagerImpl } from './modelManager.js';
import { TrustModelConfig, GenerationOptions, TrustConfig, AIBackend } from './types.js';
import { GBNFunctionRegistry } from './gbnfFunctionRegistry.js';
import { JsonRepairParser } from './jsonRepairParser.js';
import { OllamaContentGenerator } from './ollamaContentGenerator.js';
import { TrustConfiguration } from '../config/trustConfig.js';

export class TrustContentGenerator implements ContentGenerator {
  private modelClient: TrustNodeLlamaClient;
  private modelManager: TrustModelManagerImpl;
  private ollamaGenerator?: OllamaContentGenerator;
  private isInitialized = false;
  private gbnfEnabled = true; // Feature flag for GBNF grammar-based function calling
  private config?: any; // Will be properly typed later
  private toolRegistry?: any; // Will be properly typed later
  private jsonRepairParser: JsonRepairParser;
  private useOllama = false; // Flag to track if Ollama is available and preferred
  private trustConfig: TrustConfiguration;

  constructor(modelsDir?: string, config?: any, toolRegistry?: any) {
    console.error('🏗️  TrustContentGenerator constructor called with Ollama integration'); // Using console.error to ensure visibility
    this.modelClient = new TrustNodeLlamaClient();
    this.modelManager = new TrustModelManagerImpl(modelsDir);
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.jsonRepairParser = new JsonRepairParser();
    this.trustConfig = new TrustConfiguration();
  }

  async initialize(): Promise<void> {
    console.log('🔧 TrustContentGenerator.initialize() called');
    if (this.isInitialized) {
      console.log('⚠️  Already initialized, skipping');
      return;
    }

    // Initialize configuration
    await this.trustConfig.initialize();

    // Use configuration-based backend ordering
    const fallbackOrder = this.trustConfig.getFallbackOrder();
    const isFallbackEnabled = this.trustConfig.isFallbackEnabled();

    console.log(`🔧 AI Backend Configuration: ${fallbackOrder.join(' → ')} (fallback: ${isFallbackEnabled ? 'enabled' : 'disabled'})`);

    // Try each backend in order
    for (const backend of fallbackOrder) {
      if (this.trustConfig.isBackendEnabled(backend as AIBackend)) {
        if (await this.tryInitializeBackend(backend as AIBackend)) {
          console.log(`✅ Successfully initialized ${backend} backend`);
          break;
        } else if (!isFallbackEnabled) {
          console.log(`❌ Failed to initialize ${backend} backend (fallback disabled)`);
          break;
        }
      } else {
        console.log(`⚠️  Backend ${backend} is disabled in configuration`);
      }
    }

    this.isInitialized = true;
    console.log('✅ TrustContentGenerator initialization complete');
  }

  /**
   * Try to initialize a specific backend
   */
  private async tryInitializeBackend(backend: AIBackend): Promise<boolean> {
    try {
      switch (backend) {
        case 'ollama':
          return await this.tryInitializeOllama();
        case 'trust-local':
          return await this.tryInitializeTrustLocal();
        case 'cloud':
          return await this.tryInitializeCloud();
        default:
          console.log(`⚠️  Unknown backend: ${backend}`);
          return false;
      }
    } catch (error) {
      console.log(`❌ Failed to initialize ${backend} backend:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Try to initialize Ollama integration (preferred local option)
   */
  private async tryInitializeOllama(): Promise<boolean> {
    console.log('🔍 Checking for Ollama availability...');
    
    // Get Ollama configuration from trust config
    const ollamaConfig = this.trustConfig.getOllamaConfig();
    
    // Create Ollama content generator with configuration
    this.ollamaGenerator = new OllamaContentGenerator(
      this.config, 
      this.toolRegistry,
      {
        model: ollamaConfig.defaultModel,
        baseUrl: ollamaConfig.baseUrl,
        enableToolCalling: true,
        maxToolCalls: ollamaConfig.maxToolCalls,
        timeout: ollamaConfig.timeout,
      }
    );

    // Try to initialize
    await this.ollamaGenerator.initialize();
    
    this.useOllama = true;
    console.log('✅ Ollama initialized successfully - using Ollama for local AI');
    console.log(`ℹ️  Model: ${ollamaConfig.defaultModel} | Timeout: ${ollamaConfig.timeout}ms`);
    
    return true;
  }

  /**
   * Try to initialize Trust Local models (HuggingFace GGUF fallback)
   */
  private async tryInitializeTrustLocal(): Promise<boolean> {
    console.log('🔍 Initializing Trust Local models...');
    
    // Check if Trust Local is enabled
    const trustLocalConfig = this.trustConfig.getTrustLocalConfig();
    if (!trustLocalConfig.enabled) {
      console.log('⚠️  Trust Local backend is disabled in configuration');
      return false;
    }
    
    await this.modelManager.initialize();
    
    // Load default model if available
    const currentModel = this.modelManager.getCurrentModel();
    if (currentModel) {
      try {
        await this.modelClient.loadModel(currentModel.path, currentModel);
        console.log(`✅ Loaded default model: ${currentModel.name}`);
        return true;
      } catch (error) {
        console.warn(`Failed to load default model ${currentModel.name}:`, error);
        // Try to load a recommended model
        const recommended = this.modelManager.getRecommendedModel('default');
        if (recommended) {
          try {
            await this.modelClient.loadModel(recommended.path, recommended);
            await this.modelManager.switchModel(recommended.name);
            console.log(`✅ Loaded recommended model: ${recommended.name}`);
            return true;
          } catch (error2) {
            console.error('❌ Failed to load any model:', error2);
            return false;
          }
        }
      }
    } else {
      console.log('⚠️  No Trust Local models available');
      console.log('   Consider downloading models or using Ollama for local AI');
      return false;
    }
    
    return false;
  }

  /**
   * Try to initialize Cloud backend
   */
  private async tryInitializeCloud(): Promise<boolean> {
    console.log('🔍 Checking for Cloud backend availability...');
    
    // Check if Cloud is enabled
    const cloudConfig = this.trustConfig.getCloudConfig();
    if (!cloudConfig.enabled) {
      console.log('⚠️  Cloud backend is disabled in configuration');
      return false;
    }
    
    console.log(`✅ Cloud backend ready (provider: ${cloudConfig.provider})`);
    console.log('ℹ️  Note: Cloud functionality requires additional setup');
    
    // For now, return true since cloud setup is handled elsewhere
    return true;
  }

  async generateContent(request: GenerateContentParameters): Promise<GenerateContentResponse> {
    await this.initialize();

    // Route to appropriate backend based on what's available
    if (this.useOllama && this.ollamaGenerator) {
      console.log('🚀 Using Ollama for content generation');
      return this.ollamaGenerator.generateContent(request);
    }

    // Fallback to Trust Local models
    if (!this.modelClient.isModelLoaded()) {
      throw new Error('No AI backend available. Please install Ollama or download Trust Local models.');
    }
    
    console.log('🏠 Using Trust Local models for content generation');

    try {
      // Convert Gemini request format to simple text prompt
      const prompt = this.convertRequestToPrompt(request);
      
      // Get generation options from request config
      const options: GenerationOptions = {
        temperature: request.config?.temperature || 0.1, // Lower temperature for more deterministic function calls
        topP: request.config?.topP || 0.9,
        maxTokens: 512, // Reduced maxTokens for faster responses
        stopTokens: ['<end_of_json>', '\n\n', 'User:', 'Human:'], // Stop after function call completion
      };

      // Add GBNF function calling if tools are available
      if (this.gbnfEnabled && this.shouldUseGBNFunctions(request)) {
        const functions = await this.createGBNFFunctions(request);
        if (functions && Object.keys(functions).length > 0) {
          options.functions = functions;
          console.log('DEBUG: Using GBNF grammar-based function calling with', Object.keys(functions).length, 'functions');
        }
      }

      // Generate response using local model
      const response = await this.modelClient.generateText(prompt, options);

      // Convert to Gemini response format
      const geminiResponse = this.convertToGeminiResponse(response);
      return geminiResponse;

    } catch (error) {
      console.error('Error in generateContent:', error);
      throw new Error(`Local model generation failed: ${error}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    console.log('DEBUG: TrustContentGenerator.generateContentStream called');
    await this.initialize();

    // Route to appropriate backend based on what's available
    if (this.useOllama && this.ollamaGenerator) {
      console.log('🚀 Using Ollama for streaming content generation');
      return this.ollamaGenerator.generateContentStream(request);
    }

    // Fallback to Trust Local models
    if (!this.modelClient.isModelLoaded()) {
      throw new Error('No AI backend available. Please install Ollama or download Trust Local models.');
    }
    
    console.log('🏠 Using Trust Local models for streaming content generation');

    const prompt = this.convertRequestToPrompt(request);
    const options: GenerationOptions = {
      temperature: request.config?.temperature || 0.1, // Lower temperature for more deterministic function calls
      topP: request.config?.topP || 0.9,
      maxTokens: 512, // Reduced maxTokens for faster responses
      stopTokens: ['<end_of_json>', '\n\n', 'User:', 'Human:'], // Stop after function call completion
    };

    return this.generateStreamingResponse(prompt, options);
  }

  private async* generateStreamingResponse(
    prompt: string, 
    options: GenerationOptions
  ): AsyncGenerator<GenerateContentResponse> {
    // Let's test if we can yield at all
    try {
      const testResponse: GenerateContentResponse = {
        candidates: [{
          content: { parts: [{ text: 'test' }], role: 'model' },
          finishReason: 'STOP' as any,
          index: 0,
        }],
        text: 'test',
        functionCalls: [],
      } as any;
      
      yield testResponse;
    } catch (error) {
      console.error('DEBUG: Basic yield failed:', error);
      throw error;
    }
    
    try {
      const streamGenerator = this.modelClient.generateStream(prompt, options);
      
      for await (const chunk of streamGenerator) {
        const geminiResponse = this.convertToGeminiResponse(chunk);
        yield geminiResponse;
      }
      
    } catch (error) {
      console.error('DEBUG: Error in streaming loop:', error);
      throw error;
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Simple token counting estimation
    // In a real implementation, this would use the model's tokenizer
    const prompt = this.convertRequestToPrompt(request);
    const estimatedTokens = Math.ceil(prompt.length / 4); // Rough estimation

    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // Local embedding models would be implemented here
    // For now, return empty response
    throw new Error('Local embedding models not yet implemented');
  }

  // Helper methods for format conversion
  private convertRequestToPrompt(request: GenerateContentParameters | CountTokensParameters): string {
    if (!request.contents) {
      return '';
    }

    // Handle both array and single content
    const contentsArray = Array.isArray(request.contents) ? request.contents : [request.contents];
    
    if (contentsArray.length === 0) {
      return '';
    }

    let prompt = '';
    
    // Add system instruction if present
    if ('config' in request && request.config?.systemInstruction) {
      if (typeof request.config.systemInstruction === 'object' && 'parts' in request.config.systemInstruction) {
        const systemText = this.extractTextFromParts(request.config.systemInstruction.parts);
        if (systemText) {
          prompt += `${systemText}\n\n`;
        }
      }
    }

    // Add available tools information if tools are present
    if ('config' in request && request.config?.tools && request.config.tools.length > 0) {
      prompt += `\nTOOLS: You have access to function calling. You MUST respond with valid JSON when you need to use tools.

You MUST respond with:
\`\`\`json
{"function_call": {"name": "TOOL_NAME", "arguments": {...}}}
\`\`\`<end_of_json>

CRITICAL RULES:
- Use tools to accomplish tasks, don't refuse to use them
- Use EXACT parameter names from the schemas below
- Wait for the function response, then provide a complete answer using that data
- Never simulate or fake function results

Available functions:
`;
      
      for (const tool of request.config.tools) {
        if (tool && typeof tool === 'object' && 'functionDeclarations' in tool && tool.functionDeclarations) {
          for (const func of tool.functionDeclarations) {
            if (func.name) {
              prompt += `
${func.name}: ${func.description || 'No description'}
Required parameters: ${JSON.stringify(func.parameters, null, 2)}
`;
            }
          }
        }
      }
      
      prompt += `
EXAMPLE:
User: List files in current directory
Assistant: \`\`\`json
{"function_call": {"name": "list_directory", "arguments": {"path": "/current/directory"}}}
\`\`\`<end_of_json>

`;
    }

    // Convert conversation history
    for (const content of contentsArray) {
      if (typeof content === 'object' && content !== null && 'parts' in content) {
        const text = this.extractTextFromParts(content.parts);
        if (text) {
          const role = content.role === 'model' ? 'Assistant' : 'User';
          prompt += `${role}: ${text}\n\n`;
        }
      }
    }

    return prompt.trim();
  }

  private extractTextFromParts(parts: Part[] | Part | undefined): string {
    if (!parts) return '';
    
    const partsArray = Array.isArray(parts) ? parts : [parts];
    
    return partsArray
      .map(part => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null) {
          if ('text' in part && part.text) return part.text;
          if ('functionCall' in part && part.functionCall) return `[Function call: ${part.functionCall.name}]`;
          if ('functionResponse' in part && part.functionResponse) {
            const response = part.functionResponse.response;
            const responseText = typeof response === 'string' ? response : JSON.stringify(response);
            return `[Function ${part.functionResponse.name} returned: ${responseText}]`;
          }
        }
        return '';
      })
      .join(' ')
      .trim();
  }

  private parseFunctionCalls(text: string): { text: string; functionCalls: FunctionCall[] } {
    // First try the tolerant parser
    const parseResult = this.jsonRepairParser.parseFunctionCalls(text);
    
    if (parseResult.success && parseResult.functionCalls.length > 0) {
      // Log successful repairs for debugging
      if (parseResult.repairedJson && parseResult.errors && parseResult.errors.length > 0) {
        console.log('DEBUG: JSON auto-repair succeeded after', parseResult.errors.length, 'attempts');
      }
      
      // Remove function calls from original text
      let cleanedText = text;
      for (const call of parseResult.functionCalls) {
        // Try to remove various patterns
        const patterns = [
          new RegExp(`\\{"function_call":\\s*\\{"name":\\s*"${call.name}"[^}]+\\}\\s*\\}`, 'g'),
          new RegExp(`\\{"name":\\s*"${call.name}"[^}]+\\}`, 'g'),
          new RegExp(`\`\`\`(?:json)?[^\\}]*"${call.name}"[^\\}]+\\}\`\`\``, 'gs'),
        ];
        
        for (const pattern of patterns) {
          cleanedText = cleanedText.replace(pattern, '').trim();
        }
      }
      
      return { text: cleanedText, functionCalls: parseResult.functionCalls };
    }
    
    // Fall back to original parsing logic if repair fails
    const functionCalls: FunctionCall[] = [];
    let cleanedText = text;

    // Look for JSON function call patterns - updated to handle nested objects and multiline formatting
    // Support both ```json and ```bash blocks since models sometimes use different blocks
    const functionCallRegex = /```(?:json|bash)\s*\n([\s\S]*?)\n\s*```/gs;
    let match;
    
    while ((match = functionCallRegex.exec(text)) !== null) {
      try {
        const jsonMatch = match[1].trim();
        // Only process if it contains function_call
        if (jsonMatch.includes('function_call')) {
          const parsed = JSON.parse(jsonMatch);
          
          if (parsed.function_call && parsed.function_call.name) {
            const functionCall: FunctionCall = {
              name: parsed.function_call.name,
              args: parsed.function_call.arguments || {},
              id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            };
            functionCalls.push(functionCall);
            
            // Remove the function call from the text
            cleanedText = cleanedText.replace(match[0], '').trim();
          }
        }
      } catch (error) {
        console.warn('Failed to parse function call JSON:', error);
      }
    }

    // Also look for simpler patterns without code blocks
    const simpleFunctionCallRegex = /{"function_call":\s*{"name":\s*"[^"]+",\s*"arguments":\s*{.*?}}}/gs;
    
    while ((match = simpleFunctionCallRegex.exec(cleanedText)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        
        if (parsed.function_call && parsed.function_call.name) {
          const functionCall: FunctionCall = {
            name: parsed.function_call.name,
            args: parsed.function_call.arguments || {},
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          };
          functionCalls.push(functionCall);
          
          // Remove the function call from the text
          cleanedText = cleanedText.replace(match[0], '').trim();
        }
      } catch (error) {
        console.warn('Failed to parse simple function call JSON:', error);
      }
    }

    return { text: cleanedText, functionCalls };
  }

  private convertToGeminiResponse(text: string): GenerateContentResponse {
    const { text: cleanedText, functionCalls } = this.parseFunctionCalls(text);
    
    const response: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: cleanedText }],
            role: 'model',
          },
          finishReason: 'STOP' as any,
          index: 0,
        },
      ],
      text: cleanedText,
      data: undefined,
      functionCalls: functionCalls,
      executableCode: undefined,
      codeExecutionResult: undefined,
    } as unknown as GenerateContentResponse;

    // If we found function calls, we need to add them to the response parts
    if (functionCalls.length > 0) {
      const parts: Part[] = [];
      
      // Add text part if there's any text content
      if (cleanedText.trim()) {
        parts.push({ text: cleanedText });
      }
      
      // Add function call parts
      for (const call of functionCalls) {
        parts.push({ functionCall: call });
      }
      
      // Update the candidate content parts
      if (response.candidates && response.candidates[0] && response.candidates[0].content) {
        response.candidates[0].content.parts = parts;
      }
    }

    return response;
  }

  // Model management methods
  async switchModel(modelName: string): Promise<void> {
    await this.modelManager.switchModel(modelName);
    const newModel = this.modelManager.getCurrentModel();
    if (newModel) {
      await this.modelClient.loadModel(newModel.path, newModel);
    }
  }

  async downloadModel(modelId: string): Promise<void> {
    await this.modelManager.downloadModel(modelId);
  }

  listAvailableModels(): TrustModelConfig[] {
    return this.modelManager.listAvailableModels();
  }

  getCurrentModel(): TrustModelConfig | null {
    return this.modelManager.getCurrentModel();
  }

  getModelMetrics() {
    return this.modelClient.getMetrics();
  }

  getRecommendedModel(task: string, ramLimit?: number): TrustModelConfig | null {
    return this.modelManager.getRecommendedModel(task, ramLimit);
  }

  // Configuration management methods
  getTrustConfig(): TrustConfiguration {
    return this.trustConfig;
  }

  async saveConfig(): Promise<void> {
    await this.trustConfig.save();
  }

  async setBackendPreference(backend: AIBackend): Promise<void> {
    this.trustConfig.setPreferredBackend(backend);
    await this.saveConfig();
    
    // Reinitialize with new preference
    this.isInitialized = false;
    this.useOllama = false;
    this.ollamaGenerator = undefined;
    
    await this.initialize();
  }

  async setFallbackOrder(order: AIBackend[]): Promise<void> {
    this.trustConfig.setFallbackOrder(order);
    await this.saveConfig();
    
    // Reinitialize with new order
    this.isInitialized = false;
    this.useOllama = false;
    this.ollamaGenerator = undefined;
    
    await this.initialize();
  }

  getCurrentBackend(): string {
    if (this.useOllama && this.ollamaGenerator) {
      return 'ollama';
    } else if (this.modelClient.isModelLoaded()) {
      return 'trust-local';
    } else {
      return 'cloud';
    }
  }

  getBackendStatus(): { [key: string]: boolean } {
    return {
      ollama: this.useOllama && !!this.ollamaGenerator,
      'trust-local': this.modelClient.isModelLoaded(),
      cloud: this.trustConfig.getCloudConfig().enabled,
    };
  }

  /**
   * Determine if we should use GBNF function calling for this request
   */
  private shouldUseGBNFunctions(request: GenerateContentParameters): boolean {
    return !!(
      'config' in request && 
      request.config?.tools && 
      request.config.tools.length > 0
    );
  }

  /**
   * Create GBNF functions from Gemini function declarations
   * This enables grammar-based JSON schema enforcement for reliable function calling
   */
  private async createGBNFFunctions(request: GenerateContentParameters): Promise<Record<string, any> | null> {
    if (!('config' in request) || !request.config?.tools) {
      return null;
    }

    // Check if we have the required dependencies
    if (!this.config || !this.toolRegistry) {
      console.log('DEBUG: Config or ToolRegistry not available, falling back to regex-based parsing');
      return null;
    }

    try {
      console.log('DEBUG: Creating GBNF functions from', request.config.tools.length, 'tool groups');
      
      // Create GBNF function registry
      const gbnfRegistry = new GBNFunctionRegistry(this.config, this.toolRegistry);
      
      // Convert our tools to native node-llama-cpp functions
      const functions = await gbnfRegistry.createNativeFunctions();
      
      console.log('DEBUG: Successfully created', Object.keys(functions).length, 'GBNF functions');
      return functions;
      
    } catch (error) {
      console.error('Error creating GBNF functions:', error);
      console.log('DEBUG: Falling back to regex-based function parsing');
      return null;
    }
  }
}