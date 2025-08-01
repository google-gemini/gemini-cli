/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProxyAgent, setGlobalDispatcher } from 'undici';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  FinishReason,
} from '@google/genai';
import type {
  DatabricksConfig,
  DatabricksRequest,
  DatabricksResponse,
  DatabricksMessage,
  DatabricksStreamChunk,
  DatabricksGenerateContentParameters,
} from './types.js';
import { DATABRICKS_MODEL_MAPPING, DATABRICKS_MODELS } from './types.js';

export class DatabricksContentGenerator implements ContentGenerator {
  private config: DatabricksConfig;
  private workspaceHost: string;
  private databricksModel: string;
  private headers: Record<string, string>;

  constructor(config: DatabricksConfig, proxy?: string) {
    this.validateConfig(config);
    this.config = config;

    // Normalize workspace host (remove trailing slash)
    this.workspaceHost = config.workspace_host.replace(/\/$/, '');

    // Map model name if needed
    this.databricksModel =
      DATABRICKS_MODEL_MAPPING[config.model] || config.model;

    // Set up headers for requests
    this.headers = {
      Authorization: `Bearer ${config.auth_token}`,
      'Content-Type': 'application/json',
    };

    // Set up proxy if provided
    if (proxy) {
      const proxyAgent = new ProxyAgent(proxy);
      setGlobalDispatcher(proxyAgent);
    }
  }

  private validateConfig(config: DatabricksConfig): void {
    if (!config.workspace_host) {
      throw new Error('Databricks workspace host is required');
    }
    if (!config.auth_token) {
      throw new Error('Databricks auth token is required');
    }
    if (!config.model) {
      throw new Error('Databricks model is required');
    }
  }

  getWorkspaceHost(): string {
    return this.workspaceHost;
  }

  getDatabricksModel(): string {
    return this.databricksModel;
  }

  getAvailableModels(): string[] {
    return [...DATABRICKS_MODELS];
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    // Convert to our internal format with prompt field
    const dbRequest = this.convertToInternalFormat(request);
    const databricksRequest = this.transformRequest(dbRequest, false);
    const url = `${this.workspaceHost}/serving-endpoints/${this.databricksModel}/invocations`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(databricksRequest),
      });

      if (!response.ok) {
        throw await this.createErrorFromResponse(response);
      }

      const data = (await response.json()) as DatabricksResponse;
      return this.transformResponse(data);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const signal = request.config?.abortSignal;
    return this._generateContentStream(request, userPromptId, signal);
  }

  private async *_generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<GenerateContentResponse> {
    // Convert to our internal format with prompt field
    const dbRequest = this.convertToInternalFormat(request);
    const databricksRequest = this.transformRequest(dbRequest, true);
    const url = `${this.workspaceHost}/serving-endpoints/${this.databricksModel}/invocations`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(databricksRequest),
        signal,
      });

      if (!response.ok) {
        throw await this.createErrorFromResponse(response);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (signal?.aborted) {
          reader.releaseLock();
          const error = new Error('Request aborted');
          error.name = 'AbortError';
          throw error;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              return;
            }

            if (data) {
              try {
                const parsed = JSON.parse(data) as DatabricksStreamChunk;
                const transformed = this.transformStreamChunk(parsed);
                if (transformed) {
                  yield transformed;
                }
              } catch (_e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      throw this.handleError(error);
    }
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Simple estimation: ~4 characters per token
    let totalChars = 0;

    if (request.contents) {
      // Handle contents which can be an array or a single item
      const contentsArray = Array.isArray(request.contents)
        ? request.contents
        : [request.contents];
      
      for (const content of contentsArray) {
        if (typeof content === 'object' && content !== null && 'parts' in content) {
          const typedContent = content as { parts: Array<{ text?: string }> };
          for (const part of typedContent.parts) {
            if ('text' in part && part.text) {
              totalChars += part.text.length;
            }
          }
        }
      }
    }

    const estimatedTokens = Math.ceil(totalChars / 4);

    return {
      totalTokens: totalChars === 0 ? 0 : estimatedTokens,
    };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error('Embedding is not supported by Databricks provider');
  }

  private convertToInternalFormat(
    request: GenerateContentParameters,
  ): DatabricksGenerateContentParameters {
    // Extract text from contents
    let prompt = '';
    let systemInstruction: { text: string } | undefined;

    // Handle system instruction if provided
    if ('systemInstruction' in request && request.systemInstruction) {
      systemInstruction = request.systemInstruction;
    }

    if ('contents' in request && request.contents) {
      // Handle contents which can be an array or a single item
      const contentsArray = Array.isArray(request.contents)
        ? request.contents
        : [request.contents];
      
      for (const content of contentsArray) {
        // Check if content has the expected structure
        if (typeof content === 'object' && content !== null && 'role' in content && 'parts' in content) {
          const typedContent = content as { role: string; parts: Array<{ text?: string }> };
          
          if (typedContent.role === 'user') {
            for (const part of typedContent.parts) {
              if ('text' in part && part.text) {
                prompt += part.text;
              }
            }
          }
        }
      }
    }

    return {
      prompt,
      model: request.model,
      systemInstruction,
      generationConfig: request.config
        ? {
            temperature: request.config.temperature,
            maxOutputTokens: request.config.maxOutputTokens,
            topP: request.config.topP,
            stopSequences: request.config.stopSequences,
          }
        : undefined,
      config: {
        abortSignal: request.config?.abortSignal,
      },
    };
  }

  private transformRequest(
    request: DatabricksGenerateContentParameters,
    stream: boolean,
  ): DatabricksRequest {
    const messages: DatabricksMessage[] = [];

    // Add system message if provided
    if (request.systemInstruction?.text) {
      messages.push({
        role: 'system',
        content: request.systemInstruction.text,
      });
    }

    // Add user message
    messages.push({
      role: 'user',
      content: request.prompt,
    });

    // Build request
    const databricksRequest: DatabricksRequest = {
      messages,
      max_tokens: request.generationConfig?.maxOutputTokens || 4096,
      temperature: request.generationConfig?.temperature || 0.7,
      stream,
    };

    // Add optional parameters
    if (request.generationConfig?.topP !== undefined) {
      databricksRequest.top_p = request.generationConfig.topP;
    }

    if (request.generationConfig?.stopSequences) {
      databricksRequest.stop = request.generationConfig.stopSequences;
    }

    return databricksRequest;
  }

  private transformResponse(
    response: DatabricksResponse,
  ): GenerateContentResponse {
    const choice = response.choices[0];
    const content = choice?.message?.content || '';

    const result = {
      candidates: [
        {
          content: {
            parts: [{ text: content }],
            role: 'model',
          },
          finishReason: this.mapFinishReason(choice?.finish_reason),
          index: 0,
          safetyRatings: [],
        },
      ],
      usageMetadata: {
        promptTokenCount: response.usage?.prompt_tokens || 0,
        candidatesTokenCount: response.usage?.completion_tokens || 0,
        totalTokenCount: response.usage?.total_tokens || 0,
      },
    };

    // Cast through unknown to handle the type mismatch
    return {
      ...result,
      text: content,
      data: [],
      functionCalls: [],
      executableCode: [],
      codeExecutionResult: [],
    } as unknown as GenerateContentResponse;
  }

  private transformStreamChunk(
    chunk: DatabricksStreamChunk,
  ): GenerateContentResponse | null {
    const choice = chunk.choices[0];

    if (!choice || !choice.delta?.content) {
      // Check if this is the final chunk with usage data
      if (choice?.finish_reason) {
        const result = {
          candidates: [
            {
              content: {
                parts: [{ text: '' }],
                role: 'model',
              },
              finishReason: this.mapFinishReason(choice.finish_reason),
              index: 0,
              safetyRatings: [],
            },
          ],
          usageMetadata: chunk.usage
            ? {
                promptTokenCount: chunk.usage.prompt_tokens || 0,
                candidatesTokenCount: chunk.usage.completion_tokens || 0,
                totalTokenCount: chunk.usage.total_tokens || 0,
              }
            : undefined,
        };
        return {
          ...result,
          text: '',
          data: [],
          functionCalls: [],
          executableCode: [],
          codeExecutionResult: [],
        } as unknown as GenerateContentResponse;
      }
      return null;
    }

    const textContent = choice.delta.content;
    const result = {
      candidates: [
        {
          content: {
            parts: [{ text: textContent }],
            role: 'model',
          },
          finishReason: choice.finish_reason
            ? this.mapFinishReason(choice.finish_reason)
            : undefined,
          index: choice.index,
          safetyRatings: [],
        },
      ],
      usageMetadata: chunk.usage
        ? {
            promptTokenCount: chunk.usage.prompt_tokens || 0,
            candidatesTokenCount: chunk.usage.completion_tokens || 0,
            totalTokenCount: chunk.usage.total_tokens || 0,
          }
        : undefined,
    };

    return {
      ...result,
      text: textContent,
      data: [],
      functionCalls: [],
      executableCode: [],
      codeExecutionResult: [],
    } as unknown as GenerateContentResponse;
  }

  private mapFinishReason(reason?: string): FinishReason | undefined {
    const mapping: Record<string, FinishReason> = {
      stop: 'STOP' as FinishReason,
      length: 'MAX_TOKENS' as FinishReason,
      content_filter: 'SAFETY' as FinishReason,
      function_call: 'STOP' as FinishReason,
    };

    return reason ? mapping[reason] || ('STOP' as FinishReason) : undefined;
  }

  private async createErrorFromResponse(response: Response): Promise<Error> {
    let message = '';
    try {
      const data = await response.json();
      message = data.error || data.message || response.statusText;
    } catch {
      message = response.statusText;
    }

    switch (response.status) {
      case 401:
        return new Error('Authentication failed: ' + message);
      case 429:
        return new Error('Rate limit exceeded: ' + message);
      case 404:
        return new Error('Model not found: ' + message);
      default:
        return new Error(
          `Databricks API error (${response.status}): ${message}`,
        );
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error('Databricks API error: ' + String(error));
  }
}
