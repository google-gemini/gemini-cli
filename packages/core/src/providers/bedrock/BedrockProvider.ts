/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Tool,
} from '@google/genai';
import {
  ContentGenerator,
  ContentGeneratorConfig,
} from '../../core/contentGenerator.js';
import { Config } from '../../config/config.js';
import { BedrockToolConverter } from './BedrockToolConverter.js';
import { BedrockMessageConverter } from './BedrockMessageConverter.js';
import { BedrockStreamHandler } from './BedrockStreamHandler.js';
import {
  BedrockError,
  BedrockGenerateContentRequest,
  BedrockAPIRequest,
  BedrockMessage,
  BedrockMessageParam,
  ExtendedGenerateContentParameters,
} from './BedrockTypes.js';
import type {
  MessageCreateParamsNonStreaming,
  MessageCreateParamsStreaming,
} from '@anthropic-ai/sdk/resources/messages';

/**
 * AWS Bedrock implementation of ContentGenerator
 */
export class BedrockProvider implements ContentGenerator {
  private client: AnthropicBedrock;
  private config: Config;
  private contentGeneratorConfig: ContentGeneratorConfig;
  private messageConverter: BedrockMessageConverter;
  private streamHandler: BedrockStreamHandler;

  constructor(config: ContentGeneratorConfig, gcConfig: Config) {
    this.contentGeneratorConfig = config;
    this.config = gcConfig;
    this.messageConverter = new BedrockMessageConverter();
    this.streamHandler = new BedrockStreamHandler(gcConfig);

    // Validate AWS configuration
    this.validateAwsConfig();

    // Initialize Bedrock client
    try {
      this.client = new AnthropicBedrock({
        awsRegion: process.env.AWS_REGION,
        // AWS credentials are automatically loaded from the environment or AWS credential chain
      });
    } catch (error) {
      throw new BedrockError(
        `Failed to initialize Bedrock client: ${this.getErrorMessage(error)}`,
        'INITIALIZATION_ERROR'
      );
    }
  }

  /**
   * Validate AWS configuration
   */
  private validateAwsConfig(): void {
    if (!process.env.AWS_REGION) {
      throw new BedrockError(
        'AWS_REGION environment variable is required for Bedrock',
        'MISSING_CONFIG'
      );
    }

    // AWS SDK will handle credential validation, but we can check for obvious issues
    const hasCredentials =
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_PROFILE ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.AWS_EXECUTION_ENV;

    if (!hasCredentials) {
      console.warn(
        'No obvious AWS credentials found. Bedrock client will attempt to use the default credential chain.'
      );
    }
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    try {
      const apiRequest = this.prepareRequest(request);
      const currentModel = this.config.getModel();

      if (this.config.getDebugMode()) {
        console.debug('[BedrockProvider] Sending request with model:', currentModel);
        console.debug('[BedrockProvider] Full request:', JSON.stringify(apiRequest, null, 2));
      }

      const response = await this.client.messages.create(
        apiRequest as MessageCreateParamsNonStreaming
      );

      if (this.config.getDebugMode()) {
        console.debug('[BedrockProvider] Received response:', JSON.stringify(response, null, 2));
      }

      return this.convertResponse(response, this.isJsonMode(request));
    } catch (error) {
      throw this.handleError(error, 'generateContent');
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    try {
      const apiRequest = this.prepareRequest(request);
      const streamRequest = { ...apiRequest, stream: true };
      const currentModel = this.config.getModel();

      if (this.config.getDebugMode()) {
        console.debug('[BedrockProvider] Streaming request with model:', currentModel);
        console.debug('[BedrockProvider] Full streaming request:', JSON.stringify(streamRequest, null, 2));
      }

      const stream = await this.client.messages.create(
        streamRequest as MessageCreateParamsStreaming
      );

      return this.streamHandler.handleStream(stream);
    } catch (error) {
      throw this.handleError(error, 'generateContentStream');
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    try {
      // Extract contents from the request
      const contents = this.extractContents(request);
      const messages = this.messageConverter.convertToBedrockMessages(contents);

      // Use Anthropic's token counting if available in the future
      // For now, use a more accurate estimation based on Claude's tokenization
      const totalTokens = this.estimateTokens(messages);

      return {
        totalTokens,
      };
    } catch (error) {
      throw this.handleError(error, 'countTokens');
    }
  }

  async embedContent(_request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new BedrockError(
      'Embeddings are not supported with AWS Bedrock Claude models. Consider using Amazon Titan Embeddings or another embedding model.',
      'NOT_SUPPORTED'
    );
  }

  /**
   * Prepare a Bedrock request from Gemini parameters
   */
  private prepareRequest(request: GenerateContentParameters): BedrockAPIRequest {
    const contents = this.extractContents(request);
    const messages = this.messageConverter.convertToBedrockMessages(contents);
    const tools = this.extractTools(request);

    const maxTokens = this.extractMaxTokens(request);
    const temperature = this.extractTemperature(request);
    const systemInstruction = this.extractSystemInstruction(request);

    // Get the current model from config (may have been updated via /model command)
    const currentModel = this.config.getModel();
    
    const bedrockRequest: BedrockGenerateContentRequest = {
      model: currentModel,
      messages,
      maxTokens,
    };
    
    // Create the actual request with proper field name
    const apiRequest: BedrockAPIRequest = {
      model: currentModel,
      messages,
      max_tokens: maxTokens,
    };

    if (temperature !== undefined) {
      bedrockRequest.temperature = temperature;
      apiRequest.temperature = temperature;
    }

    if (tools && tools.length > 0) {
      const bedrockTools = BedrockToolConverter.convertToBedrockTools(tools);
      if (bedrockTools.length > 0) {
        bedrockRequest.tools = bedrockTools;
        apiRequest.tools = bedrockTools;
        
        if (this.config.getDebugMode()) {
          console.debug('[BedrockProvider] Converted tools:', JSON.stringify(bedrockTools, null, 2));
          
          // Detailed logging for tool schema types
          bedrockTools.forEach((tool, index) => {
            console.debug(`[BedrockProvider] Tool ${index} (${tool.name}):`);
            console.debug(`  - input_schema.type: ${typeof tool.input_schema?.type} = "${tool.input_schema?.type}"`);
            
            // Log properties if they exist
            if (tool.input_schema?.properties) {
              console.debug(`  - input_schema.properties:`, tool.input_schema.properties);
              Object.entries(tool.input_schema.properties as Record<string, unknown>).forEach(([propName, propSchema]) => {
                if (propSchema && typeof propSchema === 'object' && 'type' in propSchema) {
                  console.debug(`    - ${propName}.type: ${typeof propSchema.type} = "${propSchema.type}"`);
                }
              });
            }
          });
        }
      }
    }

    // Handle system instruction
    let systemPrompt = '';
    if (systemInstruction) {
      systemPrompt = BedrockMessageConverter.extractSystemInstruction(systemInstruction);
    }

    // Add JSON mode instructions if needed
    if (this.isJsonMode(request)) {
      const jsonInstruction = this.getJsonModeInstruction(request);
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${jsonInstruction}` : jsonInstruction;
    }

    if (systemPrompt) {
      bedrockRequest.system = systemPrompt;
      apiRequest.system = systemPrompt;
    }

    return apiRequest;
  }

  /**
   * Convert Bedrock response to Gemini format
   */
  private convertResponse(
    response: BedrockMessage,
    isJsonMode: boolean
  ): GenerateContentResponse {
    const parts = this.messageConverter.convertFromBedrockResponse(response, isJsonMode);
    
    // Create a proper GenerateContentResponse instance
    const result = Object.assign(Object.create(GenerateContentResponse.prototype), {
      candidates: [{
        index: 0,
        content: {
          role: 'model',
          parts,
        },
      }],
      usageMetadata: BedrockStreamHandler.createUsageMetadata(
        response.usage?.input_tokens,
        response.usage?.output_tokens
      ),
    });

    return result as GenerateContentResponse;
  }

  /**
   * Extract contents from various request formats
   */
  private extractContents(request: GenerateContentParameters | CountTokensParameters): Content[] {
    // Handle different property names that might be used
    const req = request as ExtendedGenerateContentParameters;
    return req.contents || req.content || [];
  }

  /**
   * Extract tools from request
   */
  private extractTools(request: GenerateContentParameters): Tool[] | undefined {
    const req = request as ExtendedGenerateContentParameters;
    // Check both top-level tools and config.tools (Gemini pattern)
    return req.tools || req.tool || req.config?.tools || undefined;
  }

  /**
   * Extract max tokens from request
   */
  private extractMaxTokens(request: GenerateContentParameters): number {
    const req = request as ExtendedGenerateContentParameters;
    return (
      req.config?.maxOutputTokens ||
      req.generation_config?.max_output_tokens ||
      req.generationConfig?.maxOutputTokens ||
      8192
    );
  }

  /**
   * Extract temperature from request
   */
  private extractTemperature(request: GenerateContentParameters): number | undefined {
    const req = request as ExtendedGenerateContentParameters;
    return (
      req.config?.temperature ??
      req.generation_config?.temperature ??
      req.generationConfig?.temperature
    );
  }

  /**
   * Extract system instruction from request
   */
  private extractSystemInstruction(request: GenerateContentParameters): Content | string | undefined {
    const req = request as ExtendedGenerateContentParameters;
    return (
      req.config?.systemInstruction ||
      req.system_instruction ||
      req.systemInstruction
    );
  }

  /**
   * Check if JSON mode is requested
   */
  private isJsonMode(request: GenerateContentParameters): boolean {
    const req = request as ExtendedGenerateContentParameters;
    return req.config?.responseMimeType === 'application/json';
  }

  /**
   * Get JSON mode instruction
   */
  private getJsonModeInstruction(request: GenerateContentParameters): string {
    const req = request as ExtendedGenerateContentParameters;
    const jsonInstruction = 'You are a JSON-only assistant. Your entire response must be valid JSON. Do not include any text before or after the JSON. Do not include markdown code blocks. Start your response with { or [ and end with } or ].';
    
    if (req.config?.responseSchema) {
      const schemaInstruction = `\nThe JSON must conform to this schema: ${JSON.stringify(req.config.responseSchema, null, 2)}`;
      return `${jsonInstruction}${schemaInstruction}`;
    }
    
    return jsonInstruction;
  }

  /**
   * Estimate tokens for Bedrock messages
   */
  private estimateTokens(messages: BedrockMessageParam[]): number {
    // More accurate estimation for Claude models
    // Claude uses a similar tokenization to GPT models
    // Average of ~3.5 characters per token for English text
    let totalChars = 0;

    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'text' && block.text) {
            totalChars += block.text.length;
          } else if (block.type === 'image') {
            // Images typically use ~750 tokens
            totalChars += 750 * 3.5;
          }
        }
      }
    }

    return Math.ceil(totalChars / 3.5);
  }

  /**
   * Handle errors consistently
   */
  private handleError(error: unknown, operation: string): BedrockError {
    const message = this.getErrorMessage(error);
    const errorCode = this.getErrorCode(error);
    const statusCode = this.getStatusCode(error);
    const currentModel = this.config.getModel();

    console.error(`[BedrockProvider] Error in ${operation}:`, {
      message,
      statusCode,
      errorCode,
      model: currentModel,
      operation
    });

    if (statusCode === 401) {
      return new BedrockError(
        'AWS credentials are invalid or missing. Please check your AWS configuration.',
        'AUTH_ERROR',
        401
      );
    }

    if (statusCode === 403) {
      return new BedrockError(
        'Access denied. Please ensure your AWS credentials have permission to invoke Bedrock models.',
        'PERMISSION_ERROR',
        403
      );
    }

    if (statusCode === 429) {
      return new BedrockError(
        'Rate limit exceeded. Please try again later.',
        'RATE_LIMIT',
        429
      );
    }

    // Include model information in error messages for better debugging
    const enhancedMessage = statusCode === 400 
      ? `Bedrock operation failed: ${message} (Model: ${currentModel})`
      : `Bedrock operation failed: ${message}`;
    
    return new BedrockError(
      enhancedMessage,
      errorCode,
      statusCode
    );
  }

  /**
   * Extract error message
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return String(error);
  }

  /**
   * Extract error code
   */
  private getErrorCode(error: unknown): string | undefined {
    if (error && typeof error === 'object' && 'code' in error) {
      return String(error.code);
    }
    return undefined;
  }

  /**
   * Extract status code
   */
  private getStatusCode(error: unknown): number | undefined {
    if (error && typeof error === 'object' && 'status' in error) {
      return Number(error.status);
    }
    return undefined;
  }
}