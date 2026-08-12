/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import {
  GenerateContentResponse,
  type GenerateContentParameters,
  type CountTokensParameters,
  type CountTokensResponse,
} from '@google/genai';
import type { ContentGenerator, ContentGeneratorConfig } from './contentGenerator.js';
import type { UserTierId, GeminiUserTier } from '../code_assist/types.js';
import { resolveVertexClaudeModel, getLatestModelId } from '../config/models.js';

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

    if (apiKey) {
      const baseURL = contentConfig.baseUrl || process.env['ANTHROPIC_BASE_URL'];
      this.client = new Anthropic({
        apiKey,
        ...(baseURL && { baseURL }),
      });
    } else if (project) {
      this.client = new AnthropicVertex({
        projectId: project,
        region: location,
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
    const functionCalls: Array<{ name: string; args: Record<string, unknown>; id?: string }> = [];
    let usageMetadata: any = undefined;

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

    const parts: any[] = [];
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
          finishReason: 'STOP' as any,
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
    const model = this.client instanceof AnthropicVertex
      ? resolveVertexClaudeModel(this.modelName)
      : getLatestModelId(this.modelName);

    console.error(`[ANTHROPIC_DIRECT] Routing request to model: ${model} via ${this.client instanceof AnthropicVertex ? 'Vertex AI' : 'Anthropic Direct API'}`);

    const stream = await this.client.messages.create({
      ...anthropicParams,
      model,
      stream: true,
    });

    return this.createStreamGenerator(stream);
  }

  private async *createStreamGenerator(
    stream: AsyncIterable<Anthropic.MessageStreamEvent>,
  ): AsyncGenerator<GenerateContentResponse, void, unknown> {
    let currentToolCall: { id: string; name: string; inputJson: string } | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReasonEmitted = false;

    for await (const event of stream) {
      if (event.type === 'message_start') {
        inputTokens = event.message.usage?.input_tokens || 0;
        console.error(`[ANTHROPIC_DIRECT] Connected! Remote provider returned message model ID: ${event.message.model}`);
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
            parsedArgs = JSON.parse(currentToolCall.inputJson || '{}');
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
    const sysInst = (request as any).systemInstruction || request.config?.systemInstruction;
    if (sysInst) {
      const parts = Array.isArray(sysInst)
        ? sysInst
        : sysInst.parts || [sysInst];
      systemInstruction = parts.map((p: any) => typeof p === 'string' ? p : p.text || '').join('\n');
    }

    const messages: Anthropic.MessageParam[] = [];
    const rawContents: any[] = Array.isArray(request.contents)
      ? request.contents
      : request.contents
        ? [request.contents]
        : [];

    for (const content of rawContents) {
      if (typeof content === 'string') {
        messages.push({
          role: 'user',
          content: content,
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
          anthropicContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: (part.inlineData.mimeType as any) || 'image/png',
              data: part.inlineData.data || '',
            },
          });
        } else if (part.functionCall) {
          anthropicContent.push({
            type: 'tool_use',
            id: part.functionCall.id || `call_${Date.now()}`,
            name: part.functionCall.name || '',
            input: (part.functionCall.args as Record<string, unknown>) || {},
          });
        } else if (part.functionResponse) {
          const toolUseId =
            part.functionResponse.id || part.functionResponse.name || '';
          const responseContent = JSON.stringify(
            part.functionResponse.response || {},
          );

          const existingBlock = anthropicContent.find(
            (b): b is Anthropic.ToolResultBlockParam =>
              b.type === 'tool_result' && b.tool_use_id === toolUseId,
          );

          if (existingBlock) {
            try {
              const currentData = JSON.parse(
                typeof existingBlock.content === 'string'
                  ? existingBlock.content
                  : '{}',
              );
              const newData = part.functionResponse.response || {};
              const merged = Array.isArray(currentData)
                ? [...currentData, newData]
                : [currentData, newData];
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

    const tools: Anthropic.Tool[] = [];
    const rawTools = request.config?.tools || [];
    for (const toolGroup of rawTools as any[]) {
      if ('functionDeclarations' in toolGroup && toolGroup.functionDeclarations) {
        for (const fd of toolGroup.functionDeclarations) {
          if (fd.name) {
            tools.push({
              name: fd.name,
              description: fd.description || '',
              input_schema: (fd.parameters as unknown as Anthropic.Tool.InputSchema) || {
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
      max_tokens: request.config?.maxOutputTokens || 8192,
    };
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    let charCount = 0;
    const contents: any[] = Array.isArray(request.contents)
      ? request.contents
      : request.contents
        ? [request.contents]
        : [];

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
    _request: any,
  ): Promise<any> {
    throw new Error('Embeddings are not supported by AnthropicContentGenerator.');
  }
}
