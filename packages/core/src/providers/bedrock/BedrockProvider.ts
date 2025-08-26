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
import { retryWithBackoff } from '../../utils/retry.js';
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
  // eslint-disable-next-line import/no-internal-modules
} from '@anthropic-ai/sdk/resources/messages';

/**
 * AWS Bedrock implementation of ContentGenerator
 */
export class BedrockProvider implements ContentGenerator {
  private client: AnthropicBedrock;
  private config: Config;
  private messageConverter: BedrockMessageConverter;
  private streamHandler: BedrockStreamHandler;

  constructor(config: ContentGeneratorConfig, gcConfig: Config) {
    this.config = gcConfig;
    this.messageConverter = new BedrockMessageConverter();
    this.streamHandler = new BedrockStreamHandler(gcConfig);

    // Override model with BEDROCK_MODEL environment variable if set
    const envModel = process.env['BEDROCK_MODEL'];
    if (envModel && envModel.trim()) {
      this.config.setModel(envModel.trim());

      if (gcConfig.getDebugMode()) {
        console.debug(
          `[BedrockProvider] Using model from BEDROCK_MODEL env var: ${envModel.trim()}`,
        );
      }
    }

    // Validate AWS configuration
    this.validateAwsConfig();

    // Initialize Bedrock client
    try {
      this.client = new AnthropicBedrock({
        awsRegion: process.env['AWS_REGION'],
        // AWS credentials are automatically loaded from the environment or AWS credential chain
        timeout: parseInt(process.env['BEDROCK_TIMEOUT_MS'] || '3600000', 10), // Default 60 minutes, configurable via BEDROCK_TIMEOUT_MS
      });
    } catch (error) {
      throw new BedrockError(
        `Failed to initialize Bedrock client: ${this.getErrorMessage(error)}`,
        'INITIALIZATION_ERROR',
      );
    }
  }

  /**
   * Validate AWS configuration
   */
  private validateAwsConfig(): void {
    if (!process.env['AWS_REGION']) {
      throw new BedrockError(
        'AWS_REGION environment variable is required for Bedrock',
        'MISSING_CONFIG',
      );
    }

    // AWS SDK will handle credential validation, but we can check for obvious issues
    const hasCredentials =
      process.env['AWS_ACCESS_KEY_ID'] ||
      process.env['AWS_PROFILE'] ||
      process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'] ||
      process.env['AWS_EXECUTION_ENV'];

    if (!hasCredentials) {
      console.warn(
        'WARNING: No AWS credentials detected. Please set one of the following:\n' +
          '  - AWS_PROFILE=your-profile-name\n' +
          '  - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY\n' +
          'Bedrock client will attempt to use the default credential chain.',
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
        console.debug(
          '[BedrockProvider] Sending request with model:',
          currentModel,
        );
        console.debug(
          '[BedrockProvider] Full request:',
          JSON.stringify(apiRequest, null, 2),
        );
      }

      const response = await retryWithBackoff(
        () =>
          this.client.messages.create(
            apiRequest as MessageCreateParamsNonStreaming,
          ),
        {
          maxAttempts: 5,
          initialDelayMs: 5000,
          maxDelayMs: 60000, // 60 seconds for Bedrock quota refresh cycle
          shouldRetry: (error: Error) => {
            const status = this.getStatusCode(error);
            return (
              status === 429 ||
              status === 503 ||
              (status !== undefined && status >= 500 && status < 600)
            );
          },
        },
      );

      if (this.config.getDebugMode()) {
        console.debug(
          '[BedrockProvider] Received response:',
          JSON.stringify(response, null, 2),
        );

        // Log actual token usage
        if (response.usage) {
          console.debug('[BedrockProvider] Actual token usage from API:', {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens:
              (response.usage.input_tokens || 0) +
              (response.usage.output_tokens || 0),
          });
        }
      }

      const result = this.convertResponse(response, this.isJsonMode(request));

      // Clear tool use tracker to prevent memory leaks between requests
      this.messageConverter.clearToolUseTracker();

      return result;
    } catch (error) {
      // Clear tool use tracker on error as well
      this.messageConverter.clearToolUseTracker();
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
        console.debug(
          '[BedrockProvider] Streaming request with model:',
          currentModel,
        );
        console.debug(
          '[BedrockProvider] Full streaming request:',
          JSON.stringify(streamRequest, null, 2),
        );
      }

      const stream = await retryWithBackoff(
        () =>
          this.client.messages.create(
            streamRequest as MessageCreateParamsStreaming,
          ),
        {
          maxAttempts: 5,
          initialDelayMs: 5000,
          maxDelayMs: 60000, // 60 seconds for Bedrock quota refresh cycle
          shouldRetry: (error: Error) => {
            const status = this.getStatusCode(error);
            return (
              status === 429 ||
              status === 503 ||
              (status !== undefined && status >= 500 && status < 600)
            );
          },
        },
      );

      return this.wrapStreamWithCleanup(
        this.streamHandler.handleStream(stream),
      );
    } catch (error) {
      // Clear tool use tracker on error
      this.messageConverter.clearToolUseTracker();
      throw this.handleError(error, 'generateContentStream');
    }
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    try {
      // Extract contents from the request
      const contents = this.extractContents(request);
      const messages = this.messageConverter.convertToBedrockMessages(contents);

      // Use Anthropic's token counting if available in the future
      // For now, use a more accurate estimation based on Claude's tokenization
      const totalTokens = this.estimateTokens(messages);

      if (this.config.getDebugMode()) {
        console.debug(
          `[BedrockProvider] countTokens: ${totalTokens} estimated tokens for ${messages.length} messages`,
        );
      }

      return {
        totalTokens,
      };
    } catch (error) {
      throw this.handleError(error, 'countTokens');
    }
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new BedrockError(
      'Embeddings are not supported with AWS Bedrock Claude models. Consider using Amazon Titan Embeddings or another embedding model.',
      'NOT_SUPPORTED',
    );
  }

  /**
   * Wrap stream generator with cleanup to prevent memory leaks
   */
  private async *wrapStreamWithCleanup(
    stream: AsyncGenerator<GenerateContentResponse>,
  ): AsyncGenerator<GenerateContentResponse> {
    try {
      for await (const chunk of stream) {
        yield chunk;
      }
    } finally {
      // Clear tool use tracker after stream completes or errors
      this.messageConverter.clearToolUseTracker();
    }
  }

  /**
   * Prepare a Bedrock request from Gemini parameters
   */
  private prepareRequest(
    request: GenerateContentParameters,
  ): BedrockAPIRequest {
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
          console.debug(
            '[BedrockProvider] Converted tools:',
            JSON.stringify(bedrockTools, null, 2),
          );

          // Detailed logging for tool schema types
          bedrockTools.forEach((tool, index) => {
            console.debug(`[BedrockProvider] Tool ${index} (${tool.name}):`);
            console.debug(
              `  - input_schema.type: ${typeof tool.input_schema?.type} = "${tool.input_schema?.type}"`,
            );

            // Log properties if they exist
            if (tool.input_schema?.properties) {
              console.debug(
                `  - input_schema.properties:`,
                tool.input_schema.properties,
              );
              Object.entries(
                tool.input_schema.properties as Record<string, unknown>,
              ).forEach(([propName, propSchema]) => {
                if (
                  propSchema &&
                  typeof propSchema === 'object' &&
                  'type' in propSchema
                ) {
                  console.debug(
                    `    - ${propName}.type: ${typeof propSchema.type} = "${propSchema.type}"`,
                  );
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
      systemPrompt =
        BedrockMessageConverter.extractSystemInstruction(systemInstruction);
    }

    // Add JSON mode instructions if needed
    if (this.isJsonMode(request)) {
      const jsonInstruction = this.getJsonModeInstruction(request);
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n${jsonInstruction}`
        : jsonInstruction;
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
    isJsonMode: boolean,
  ): GenerateContentResponse {
    const parts = this.messageConverter.convertFromBedrockResponse(
      response,
      isJsonMode,
    );

    // Create a proper GenerateContentResponse instance
    const result = Object.assign(
      Object.create(GenerateContentResponse.prototype),
      {
        candidates: [
          {
            index: 0,
            content: {
              role: 'model',
              parts,
            },
          },
        ],
        usageMetadata: BedrockStreamHandler.createUsageMetadata(
          response.usage?.input_tokens,
          response.usage?.output_tokens,
        ),
      },
    );

    return result as GenerateContentResponse;
  }

  /**
   * Extract contents from various request formats
   */
  private extractContents(
    request: GenerateContentParameters | CountTokensParameters,
  ): Content[] {
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
  private extractTemperature(
    request: GenerateContentParameters,
  ): number | undefined {
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
  private extractSystemInstruction(
    request: GenerateContentParameters,
  ): Content | string | undefined {
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
    const jsonInstruction =
      'You are a JSON-only assistant. Your entire response must be valid JSON. Do not include any text before or after the JSON. Do not include markdown code blocks. Start your response with { or [ and end with } or ].';

    if (req.config?.responseSchema) {
      const schemaInstruction = `\nThe JSON must conform to this schema: ${JSON.stringify(req.config.responseSchema, null, 2)}`;
      return `${jsonInstruction}${schemaInstruction}`;
    }

    return jsonInstruction;
  }

  /**
   * Estimate tokens for Bedrock messages
   * Uses Claude-specific token estimation based on empirical testing
   */
  private estimateTokens(messages: BedrockMessageParam[]): number {
    // Claude tokenization is more conservative than GPT models
    // Based on testing, Claude uses approximately:
    // - 4 characters per token for typical English text
    // - Higher ratios for code and structured content
    // - Fixed costs for images and special tokens
    let totalChars = 0;
    let totalTokens = 0;

    for (const message of messages) {
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'text' && block.text) {
            const text = block.text;
            // Different estimation based on content type
            if (this.isCodeLikeContent(text)) {
              // Code content typically has fewer tokens per character due to dense symbols
              // Empirically tested ratios for Claude:
              // - Dense code (lots of symbols): ~2.8 chars/token
              // - Regular code: ~3.5 chars/token
              const symbolDensity =
                (text.match(/[{}()[\];,.<>=/\\|&*+\-!@#$%^]/g) || []).length /
                text.length;
              const ratio = symbolDensity > 0.2 ? 2.8 : 3.5;
              totalTokens += Math.ceil(text.length / ratio);
            } else {
              // Regular text - check if it's structured or natural language
              const hasStructure =
                /^\s*[-*+]\s+|^\s*\d+\.\s+|:\s*$|^\s*[A-Z][A-Z\s]+:/m.test(
                  text,
                );
              if (hasStructure) {
                // Structured text (lists, headings, etc.) - ~3.8 chars/token
                totalTokens += Math.ceil(text.length / 3.8);
              } else {
                // Natural language text uses ~4.2 characters per token for Claude
                totalChars += text.length;
              }
            }
          } else if (block.type === 'image') {
            // Images have a fixed token cost in Claude
            totalTokens += 750;
          } else if (block.type === 'tool_use') {
            // Tool use blocks have overhead + JSON content
            const toolContent = JSON.stringify(block);
            totalTokens += Math.ceil(toolContent.length / 3.0) + 20; // JSON overhead
          } else if (block.type === 'tool_result') {
            // Tool results are typically structured data
            const resultContent = JSON.stringify(block);
            totalTokens += Math.ceil(resultContent.length / 3.5) + 10; // Result overhead
          }
        }
      }
    }

    // Add estimated tokens from regular natural language text content
    totalTokens += Math.ceil(totalChars / 4.2);

    if (this.config.getDebugMode()) {
      console.debug(
        `[BedrockProvider] Token estimation: ${totalTokens} tokens (${totalChars} chars)`,
      );
    }

    return totalTokens;
  }

  /**
   * Detect if content appears to be code or structured data
   */
  private isCodeLikeContent(text: string): boolean {
    // Enhanced heuristics to detect various types of code content
    const codeIndicators = [
      // Structural patterns
      /^\s*[{}[\]]/m, // Starts with brackets/braces
      /[;{}]\s*$/m, // Ends with semicolon or braces
      /^\s*\w+\s*[{(]/m, // Function-like declarations

      // Programming language patterns
      /function\s+\w+\s*\(/, // Function definitions
      /class\s+\w+/, // Class definitions
      /import\s+.*from/, // Import statements
      /export\s+(default\s+)?/, // Export statements
      /^\s*(const|let|var)\s+\w+/m, // Variable declarations
      /(if|while|for)\s*\(/, // Control structures
      /\w+\.\w+\(/, // Method calls
      /=>\s*[{(]/, // Arrow functions
      /^\s*@\w+/m, // Decorators/annotations

      // Markup and data formats
      /<[a-zA-Z][^>]*>/, // XML/HTML tags
      /^\s*<!DOCTYPE/m, // HTML doctype
      /^\s*---\s*$/m, // YAML frontmatter
      /^\s*[\w-]+:\s*[|>]/m, // YAML multiline
      /^\s*"[\w-]+"\s*:/m, // JSON keys
      /^\s*\w+\s*=\s*["'].+["']/m, // Config assignments

      // Comments
      /^\s*\/\/|^\s*\/\*/m, // JS/C-style comments
      /^\s*#[^!]/m, // Shell/Python comments (not shebang)
      /^\s*<!--/m, // HTML comments
      /^\s*--\s/m, // SQL comments

      // Shell/terminal patterns
      /^\s*[$#]\s+/m, // Shell prompts
      /^\s*(sudo|npm|git|docker)\s+/m, // Common CLI commands

      // High density of punctuation (typical in code)
      /[{}()[\];,.]{3,}/, // Multiple punctuation chars
    ];

    // Check if it matches multiple indicators (more reliable)
    const matches = codeIndicators.filter((pattern) =>
      pattern.test(text),
    ).length;

    // Also check character density - code typically has more symbols
    const symbolDensity =
      (text.match(/[{}()[\];,.<>=/\\|&*+\-!@#$%^]/g) || []).length /
      text.length;

    return matches >= 2 || symbolDensity > 0.15;
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
      operation,
    });

    if (statusCode === 401) {
      return new BedrockError(
        'AWS credentials are invalid or missing. Please check your AWS configuration.',
        'AUTH_ERROR',
        401,
      );
    }

    if (statusCode === 403) {
      return new BedrockError(
        'Access denied. Please ensure your AWS credentials have permission to invoke Bedrock models.',
        'PERMISSION_ERROR',
        403,
      );
    }

    if (statusCode === 429) {
      return new BedrockError(
        `Rate limit exceeded for model ${currentModel}. Request has been retried with 60-second backoff as per AWS best practices, but quota is still exceeded.`,
        'RATE_LIMIT',
        429,
      );
    }

    if (statusCode === 504) {
      return new BedrockError(
        `Gateway timeout for model ${currentModel}. The request took too long to process. This has been automatically retried but the request is still timing out.`,
        'GATEWAY_TIMEOUT',
        504,
      );
    }

    // Handle specific 400 error for tool_use/tool_result mismatch
    if (
      statusCode === 400 &&
      message.includes('tool_use') &&
      message.includes('tool_result')
    ) {
      return new BedrockError(
        `Conversation state error: ${message}\n\nThis typically occurs when a previous request was interrupted (e.g., by rate limiting). Please start a new conversation to resolve this issue.`,
        'CONVERSATION_STATE_ERROR',
        400,
      );
    }

    // Handle "Operation not allowed" error - usually means missing credentials or permissions
    if (statusCode === 400 && message.includes('Operation not allowed')) {
      return new BedrockError(
        `AWS Bedrock: Operation not allowed. This typically means:\n\n` +
          `1. Missing AWS credentials. Set one of these:\n` +
          `   - AWS Profile: export AWS_PROFILE=your-profile-name\n` +
          `   - Direct credentials:\n` +
          `     export AWS_ACCESS_KEY_ID=your-access-key-id\n` +
          `     export AWS_SECRET_ACCESS_KEY=your-secret-access-key\n` +
          `     export AWS_SESSION_TOKEN=your-session-token (if using temporary credentials)\n\n` +
          `2. Missing IAM permissions. Ensure your IAM user/role has:\n` +
          `   - bedrock:InvokeModel permission\n` +
          `   - Access to the specific model: ${currentModel}\n\n` +
          `3. Model access not enabled. In AWS Bedrock console:\n` +
          `   - Go to Model access\n` +
          `   - Enable access for Claude models\n\n` +
          `To verify your AWS credentials: aws sts get-caller-identity`,
        'OPERATION_NOT_ALLOWED',
        400,
      );
    }

    // Include model information in error messages for better debugging
    const enhancedMessage =
      statusCode === 400
        ? `Bedrock operation failed: ${message} (Model: ${currentModel})`
        : `Bedrock operation failed: ${message}`;

    return new BedrockError(enhancedMessage, errorCode, statusCode);
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
