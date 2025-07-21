/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GenerateContentResponse } from '@google/genai';
import { Stream } from '@anthropic-ai/sdk/streaming';
import type { MessageStreamEvent } from '@anthropic-ai/sdk/resources/messages';
import { Config } from '../../config/config.js';

/**
 * Handles streaming responses from Bedrock and converts them to Gemini format
 */
export class BedrockStreamHandler {
  private cumulativeUsage: {
    inputTokens: number;
    outputTokens: number;
  } = { inputTokens: 0, outputTokens: 0 };

  constructor(private config: Config) {}

  /**
   * Convert Bedrock stream to Gemini-compatible async generator
   */
  async *handleStream(
    stream: Stream<MessageStreamEvent>
  ): AsyncGenerator<GenerateContentResponse> {
    // Reset cumulative usage for each new stream
    this.cumulativeUsage = { inputTokens: 0, outputTokens: 0 };
    
    let currentToolUse: {
      id?: string;
      name?: string;
      input?: unknown;
    } = {};
    let accumulatedInput = '';

    try {
      for await (const event of stream) {
        if (this.config.getDebugMode()) {
          console.debug('[BedrockStreamHandler] Stream event:', JSON.stringify(event, null, 2));
        }

        switch (event.type) {
          case 'content_block_delta':
            if (event.delta?.type === 'text_delta' && event.delta.text) {
              yield this.createTextResponse(event.delta.text);
            } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
              // Accumulate tool input JSON
              accumulatedInput += event.delta.partial_json;
            }
            break;

          case 'content_block_start':
            if (event.content_block?.type === 'tool_use') {
              // Start of a tool use block
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                input: {},
              };
              accumulatedInput = '';
            }
            break;

          case 'content_block_stop':
            if (currentToolUse.name && event.index !== undefined) {
              // End of tool use block - parse and yield the complete tool call
              let parsedInput = {};
              try {
                parsedInput = accumulatedInput ? JSON.parse(accumulatedInput) : {};
              } catch (error) {
                console.error('[BedrockStreamHandler] Failed to parse tool input:', error);
                console.error('[BedrockStreamHandler] Accumulated input:', accumulatedInput);
                // Fall back to empty object on parse error
                parsedInput = {};
              }
              yield this.createToolCallResponse(currentToolUse.name, parsedInput);
              // Reset for next tool use
              currentToolUse = {};
              accumulatedInput = '';
            }
            break;

          case 'message_start':
            // Message start event - no content to yield
            if (this.config.getDebugMode()) {
              console.debug('[BedrockStreamHandler] message_start event');
            }
            break;

          case 'message_delta':
            // Message delta contains cumulative token usage
            if ('usage' in event && event.usage) {
              this.cumulativeUsage.inputTokens = event.usage.input_tokens || 0;
              this.cumulativeUsage.outputTokens = event.usage.output_tokens || 0;
              
              if (this.config.getDebugMode()) {
                console.debug('[BedrockStreamHandler] Token usage update:', {
                  inputTokens: this.cumulativeUsage.inputTokens,
                  outputTokens: this.cumulativeUsage.outputTokens
                });
              }
            }
            break;

          case 'message_stop':
            // End of message stream
            if (this.config.getDebugMode()) {
              console.debug('[BedrockStreamHandler] Stream completed with final token usage:', this.cumulativeUsage);
            }
            // Don't yield an empty chunk - usage metadata is already attached to content chunks
            break;

          default: {
            // TypeScript exhaustive check - this should never happen
            const _exhaustiveCheck: never = event;
            if (this.config.getDebugMode()) {
              console.debug('[BedrockStreamHandler] Unhandled event:', _exhaustiveCheck);
            }
          }
        }
      }
    } catch (error) {
      console.error('[BedrockStreamHandler] Stream processing error:', error);
      throw error;
    }
  }

  /**
   * Create a text response in Gemini format
   */
  private createTextResponse(text: string): GenerateContentResponse {
    const response = Object.assign(Object.create(GenerateContentResponse.prototype), {
      candidates: [{
        index: 0,
        content: {
          role: 'model',
          parts: [{ text }],
        },
      }],
    }) as GenerateContentResponse;
    
    // Attach current usage metadata if available
    if (this.cumulativeUsage.inputTokens > 0 || this.cumulativeUsage.outputTokens > 0) {
      response.usageMetadata = BedrockStreamHandler.createUsageMetadata(
        this.cumulativeUsage.inputTokens,
        this.cumulativeUsage.outputTokens
      );
    }
    
    return response;
  }

  /**
   * Create a tool call response in Gemini format
   */
  private createToolCallResponse(name: string, args: unknown): GenerateContentResponse {
    const response = Object.assign(Object.create(GenerateContentResponse.prototype), {
      candidates: [{
        index: 0,
        content: {
          role: 'model',
          parts: [{
            functionCall: {
              name,
              args: args as Record<string, unknown>,
            },
          }],
        },
      }],
    }) as GenerateContentResponse;
    
    // Attach current usage metadata if available
    if (this.cumulativeUsage.inputTokens > 0 || this.cumulativeUsage.outputTokens > 0) {
      response.usageMetadata = BedrockStreamHandler.createUsageMetadata(
        this.cumulativeUsage.inputTokens,
        this.cumulativeUsage.outputTokens
      );
    }
    
    return response;
  }

  /**
   * Create usage metadata response
   */
  static createUsageMetadata(inputTokens?: number, outputTokens?: number): GenerateContentResponse['usageMetadata'] {
    return {
      promptTokenCount: inputTokens || 0,
      candidatesTokenCount: outputTokens || 0,
      totalTokenCount: (inputTokens || 0) + (outputTokens || 0),
    };
  }
}