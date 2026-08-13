/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import {
  GenerateContentResponse,
  FinishReason,
  type GenerateContentParameters,
  type CountTokensParameters,
  type CountTokensResponse,
  type EmbedContentParameters,
  type EmbedContentResponse,
} from '@google/genai';
import type {
  ContentGenerator,
  ContentGeneratorConfig,
} from './contentGenerator.js';
import type { UserTierId, GeminiUserTier } from '../code_assist/types.js';
import {
  resolveVertexClaudeModel,
  getLatestModelId,
} from '../config/models.js';
import { debugLogger } from '../utils/debugLogger.js';
import { retryWithBackoff } from '../utils/retry.js';

export class AnthropicContentGenerator implements ContentGenerator {
  private client: Anthropic | AnthropicVertex;
  private modelName: string;
  userTier?: UserTierId;
  userTierName?: string;
  paidTier?: GeminiUserTier;

  constructor(
    contentConfig: ContentGeneratorConfig,
    modelName: string = 'claude-sonnet-5',
  ) {
    this.modelName = modelName;

    const apiKey = contentConfig.apiKey || process.env['ANTHROPIC_API_KEY'];
    const project =
      process.env['GOOGLE_CLOUD_PROJECT'] ||
      process.env['GOOGLE_CLOUD_PROJECT_ID'];
    const location = process.env['GOOGLE_CLOUD_LOCATION'] || 'global';

    const maxRetriesEnv = process.env['ANTHROPIC_MAX_RETRIES'];
    const maxRetries = maxRetriesEnv ? parseInt(maxRetriesEnv, 10) : 0;

    const baseURL = contentConfig.baseUrl || process.env['ANTHROPIC_BASE_URL'];

    if (baseURL || apiKey) {
      this.client = new Anthropic({
        apiKey: apiKey || 'dummy-key',
        ...(baseURL && { baseURL }),
        maxRetries,
      });
    } else if (project) {
      this.client = new AnthropicVertex({
        projectId: project,
        region: location,
        maxRetries,
      });
    } else {
      throw new Error(
        'Missing Anthropic credentials. Set ANTHROPIC_API_KEY for direct API access or GOOGLE_CLOUD_PROJECT with gcloud auth ADC for Vertex AI.',
      );
    }
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPrompt?: string,
  ): Promise<GenerateContentResponse> {
    const stream = await this.generateContentStream(request, _userPrompt);
    let fullText = '';
    const functionCalls: Array<{
      name: string;
      args: Record<string, unknown>;
      id?: string;
    }> = [];
    let usageMetadata: GenerateContentResponse['usageMetadata'] = undefined;

    for await (const chunk of stream) {
      const candidate = chunk.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            fullText += part.text;
          }
          if (part.functionCall) {
            functionCalls.push({
              name: part.functionCall.name || '',
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              args: (part.functionCall.args as Record<string, unknown>) || {},
              id: part.functionCall.id,
            });
          }
        }
      }
      if (chunk.usageMetadata) {
        usageMetadata = chunk.usageMetadata;
      }
    }

    const parts: Array<Record<string, unknown>> = [];
    if (fullText) {
      parts.push({ text: fullText });
    }
    for (const fc of functionCalls) {
      parts.push({
        functionCall: {
          name: fc.name,
          args: fc.args,
          id: fc.id,
        },
      });
    }

    const rawResponse = {
      candidates: [
        {
          content: {
            role: 'model',
            parts,
          },
          finishReason: FinishReason.STOP,
        },
      ],
      usageMetadata,
    };

    return Object.assign(new GenerateContentResponse(), rawResponse);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPrompt?: string,
  ): Promise<AsyncGenerator<GenerateContentResponse, void, unknown>> {
    const anthropicParams = this.mapRequestToAnthropic(request);
    const model =
      this.client instanceof AnthropicVertex
        ? resolveVertexClaudeModel(this.modelName)
        : getLatestModelId(this.modelName);

    debugLogger.log(
      `[ANTHROPIC_DIRECT] Routing request to model: ${model} via ${this.client instanceof AnthropicVertex ? 'Vertex AI' : 'Anthropic Direct API'}`,
    );

    const stream = await retryWithBackoff(
      () =>
        this.client.messages.create({
          ...anthropicParams,
          model,
          stream: true,
        }),
      {
        maxAttempts: 5,
        initialDelayMs: 1000,
        maxDelayMs: 20000,
      },
    );

    return this.createStreamGenerator(stream);
  }

  private async *createStreamGenerator(
    stream: AsyncIterable<Anthropic.MessageStreamEvent>,
  ): AsyncGenerator<GenerateContentResponse, void, unknown> {
    let currentToolCall: {
      id: string;
      name: string;
      inputJson: string;
    } | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReasonEmitted = false;

    let remoteModelId = '';

    for await (const event of stream) {
      if (event.type === 'message_start') {
        inputTokens = event.message.usage?.input_tokens || 0;
        remoteModelId = event.message.model || '';
        debugLogger.log(
          `[ANTHROPIC_DIRECT] Connected! Remote provider returned message model ID: ${event.message.model}`,
        );
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage?.output_tokens || outputTokens;
        const stopReason = event.delta?.stop_reason;
        if (stopReason) {
          finishReasonEmitted = true;
          const finishReasonMap: Record<string, string> = {
            end_turn: 'STOP',
            tool_use: 'STOP',
            max_tokens: 'MAX_TOKENS',
          };
          const finishReason = finishReasonMap[stopReason] || 'STOP';
          const rawChunk = {
            modelVersion: remoteModelId,
            candidates: [
              {
                finishReason,
                content: {
                  role: 'model',
                  parts: [],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: inputTokens,
              candidatesTokenCount: outputTokens,
              totalTokenCount: inputTokens + outputTokens,
            },
          };
          yield Object.assign(new GenerateContentResponse(), rawChunk);
        }
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolCall = {
            id: event.content_block.id,
            name: event.content_block.name,
            inputJson: '',
          };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const rawChunk = {
            modelVersion: remoteModelId,
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: event.delta.text }],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: inputTokens,
              candidatesTokenCount: outputTokens,
              totalTokenCount: inputTokens + outputTokens,
            },
          };
          yield Object.assign(new GenerateContentResponse(), rawChunk);
        } else if (event.delta.type === 'input_json_delta' && currentToolCall) {
          currentToolCall.inputJson += event.delta.partial_json;
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolCall) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            parsedArgs = JSON.parse(
              currentToolCall.inputJson || '{}',
            ) as Record<string, unknown>;
          } catch {
            parsedArgs = {};
          }
          const rawChunk = {
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [
                    {
                      functionCall: {
                        name: currentToolCall.name,
                        args: parsedArgs,
                        id: currentToolCall.id,
                      },
                    },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: inputTokens,
              candidatesTokenCount: outputTokens,
              totalTokenCount: inputTokens + outputTokens,
            },
          };
          yield Object.assign(new GenerateContentResponse(), rawChunk);
          currentToolCall = null;
        }
      }
    }

    if (!finishReasonEmitted) {
      const rawChunk = {
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              role: 'model',
              parts: [],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: inputTokens,
          candidatesTokenCount: outputTokens,
          totalTokenCount: inputTokens + outputTokens,
        },
      };
      yield Object.assign(new GenerateContentResponse(), rawChunk);
    }
  }

  private mapRequestToAnthropic(
    request: GenerateContentParameters,
  ): Omit<Anthropic.MessageCreateParamsStreaming, 'model' | 'stream'> {
    let systemInstruction = '';
    const sysInst =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (request as unknown as Record<string, unknown>)['systemInstruction'] ||
      request.config?.systemInstruction;
    if (sysInst) {
      const parts = Array.isArray(sysInst)
        ? sysInst
        : (sysInst as { parts?: unknown[] }).parts || [sysInst];
      systemInstruction = parts
        .map((p: unknown) => {
          if (typeof p === 'string') {
            return p;
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const pObj = p as { text?: string };
          return pObj.text || '';
        })
        .join('\n');
    }

    const messages: Anthropic.MessageParam[] = [];
    type RawContentPart =
      | string
      | {
          text?: string;
          inlineData?: { mimeType?: string; data?: string };
          functionCall?: {
            id?: string;
            name?: string;
            args?: Record<string, unknown>;
          };
          functionResponse?: {
            id?: string;
            name?: string;
            response?: Record<string, unknown>;
          };
        };
    type RawContent =
      | string
      | {
          role?: string;
          parts?: RawContentPart[];
        };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const rawContents = (
      Array.isArray(request.contents)
        ? request.contents
        : request.contents
          ? [request.contents]
          : []
    ) as RawContent[];

    const seenToolUseIds = new Set<string>();
    const toolIdMap = new Map<string, string[]>();

    for (const content of rawContents) {
      if (typeof content === 'string') {
        messages.push({
          role: 'user',
          content,
        });
        continue;
      }

      const role = content.role === 'model' ? 'assistant' : 'user';
      const anthropicContent: Anthropic.ContentBlockParam[] = [];

      for (const part of content.parts || []) {
        if (typeof part === 'string') {
          anthropicContent.push({
            type: 'text',
            text: part,
          });
        } else if (part.text) {
          anthropicContent.push({
            type: 'text',
            text: part.text,
          });
        } else if (part.inlineData) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const mediaType = (part.inlineData.mimeType || 'image/png') as
            | 'image/jpeg'
            | 'image/png'
            | 'image/gif'
            | 'image/webp';
          anthropicContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: part.inlineData.data || '',
            },
          });
        } else if (part.functionCall) {
          const origId =
            part.functionCall.id ||
            `call_${Date.now()}_${anthropicContent.length}`;
          let toolId = origId;
          let suffixCounter = 1;
          while (seenToolUseIds.has(toolId)) {
            toolId = `${origId}_${suffixCounter++}`;
          }
          seenToolUseIds.add(toolId);
          if (origId) {
            const list = toolIdMap.get(origId) || [];
            list.push(toolId);
            toolIdMap.set(origId, list);
          }

          anthropicContent.push({
            type: 'tool_use',
            id: toolId,
            name: part.functionCall.name || '',
            input: part.functionCall.args || {},
          });
        } else if (part.functionResponse) {
          const rawId =
            part.functionResponse.id || part.functionResponse.name || '';
          const list = toolIdMap.get(rawId);
          const toolUseId = list && list.length > 0 ? list.shift()! : rawId;
          const responseContent = JSON.stringify(
            part.functionResponse.response || {},
          );

          const existingBlock = anthropicContent.find(
            (b): b is Anthropic.ToolResultBlockParam =>
              b.type === 'tool_result' && b.tool_use_id === toolUseId,
          );

          if (existingBlock) {
            try {
              const currentData: unknown = JSON.parse(
                typeof existingBlock.content === 'string'
                  ? existingBlock.content
                  : '{}',
              );
              const newData = part.functionResponse.response || {};
              const currentArr = Array.isArray(currentData)
                ? (currentData as unknown[])
                : [currentData];
              const merged = [...currentArr, newData];
              existingBlock.content = JSON.stringify(merged);
            } catch {
              if (typeof existingBlock.content === 'string') {
                existingBlock.content = `${existingBlock.content}\n${responseContent}`;
              }
            }
          } else {
            anthropicContent.push({
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: responseContent,
            });
          }
        }
      }

      if (anthropicContent.length > 0) {
        messages.push({
          role,
          content: anthropicContent,
        });
      }
    }

    interface FunctionDecl {
      name?: string;
      description?: string;
      parameters?: unknown;
    }
    interface ToolGroup {
      functionDeclarations?: FunctionDecl[];
    }

    const tools: Anthropic.Tool[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const rawTools = (request.config?.tools || []) as ToolGroup[];
    for (const toolGroup of rawTools) {
      if (Array.isArray(toolGroup.functionDeclarations)) {
        for (const fd of toolGroup.functionDeclarations) {
          if (fd.name) {
            tools.push({
              name: fd.name,
              description: fd.description || '',
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              input_schema: (fd.parameters as Anthropic.Tool.InputSchema) || {
                type: 'object',
                properties: {},
              },
            });
          }
        }
      }
    }

    return {
      messages,
      system: systemInstruction || undefined,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: request.config?.maxOutputTokens || 16384,
    };
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    let charCount = 0;
    type ContentItem = string | { parts?: Array<string | { text?: string }> };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const contents = (
      Array.isArray(request.contents)
        ? request.contents
        : request.contents
          ? [request.contents]
          : []
    ) as ContentItem[];

    for (const c of contents) {
      if (typeof c === 'string') {
        charCount += c.length;
      } else if (c.parts) {
        for (const p of c.parts) {
          if (typeof p === 'string') charCount += p.length;
          else if (p.text) charCount += p.text.length;
        }
      }
    }

    const totalTokens = Math.ceil(charCount / 4);
    return {
      totalTokens,
    };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error(
      'Embeddings are not supported by AnthropicContentGenerator.',
    );
  }
}
