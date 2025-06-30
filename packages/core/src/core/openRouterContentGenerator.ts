/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from 'openai';
import {
  ContentGenerator,
  ContentGeneratorConfig,
} from './contentGenerator.js';
import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  Candidate,
  FinishReason,
  GenerateContentResponsePromptFeedback,
  BlockedReason,
  GenerateContentResponseUsageMetadata,
  ContentUnion,
} from '@google/genai';

interface OpenRouterUsage {
  completion_tokens?: number;
  prompt_tokens?: number;
  total_tokens?: number;
}

export function createOpenRouterContentGenerator(
  config: ContentGeneratorConfig,
  httpOptions: { headers: Record<string, string> },
): ContentGenerator {
  const openRouterClient = new OpenAI({
    baseURL: config.openRouterBaseUrl || 'https://openrouter.ai/api/v1',
    apiKey: config.apiKey,
    defaultHeaders: {
      ...httpOptions.headers,
      'HTTP-Referer': 'https://github.com/google-gemini/gemini-cli',
      'X-Title': 'Gemini CLI',
    },
  });

  async function* doGenerateContentStream(
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    try {
      const messages = convertToOpenAIFormat(request);
      const systemInstruction = extractSystemInstruction(request);

      const stream = await openRouterClient.chat.completions.create({
        model: request.model || config.model,
        messages: systemInstruction
          ? [{ role: 'system', content: systemInstruction }, ...messages]
          : messages,
        temperature: request.config?.temperature,
        top_p: request.config?.topP,
        max_tokens: request.config?.maxOutputTokens || 20000,
        tools: convertTools(request.config?.tools),
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        yield convertChunkToGeminiResponse(chunk);
      }
    } catch (error) {
      throw convertError(error);
    }
  }

  const openRouterContentGenerator: ContentGenerator = {
    async generateContent(
      request: GenerateContentParameters,
    ): Promise<GenerateContentResponse> {
      try {
        const messages = convertToOpenAIFormat(request);
        const systemInstruction = extractSystemInstruction(request);

        const completion = await openRouterClient.chat.completions.create({
          model: request.model || config.model,
          messages: systemInstruction
            ? [{ role: 'system', content: systemInstruction }, ...messages]
            : messages,
          temperature: request.config?.temperature,
          top_p: request.config?.topP,
          max_tokens: request.config?.maxOutputTokens || 20000,
          tools: convertTools(request.config?.tools),
          response_format:
            request.config?.responseMimeType === 'application/json'
              ? { type: 'json_object' }
              : undefined,
          stream: false,
          stream_options: { include_usage: true },
        });

        return convertToGeminiResponse(
          completion as OpenAI.Chat.ChatCompletion,
        );
      } catch (error) {
        throw convertError(error);
      }
    },

    async generateContentStream(
      request: GenerateContentParameters,
    ): Promise<AsyncGenerator<GenerateContentResponse>> {
      return doGenerateContentStream(request);
    },

    async countTokens(
      request: CountTokensParameters,
    ): Promise<CountTokensResponse> {
      // OpenRouter doesn't have a dedicated token counting endpoint
      // We'll estimate based on the tiktoken library or return a placeholder
      // For now, return an estimate based on content length
      const contents = normalizeContents(request.contents);
      const totalText = contents
        .map(
          (content: Content) =>
            content.parts
              ?.map((part: Part) => {
                if ('text' in part && part.text) return part.text;
                return '';
              })
              .join(' ') || '',
        )
        .join(' ');

      // Rough estimate: 1 token per 4 characters
      const estimatedTokens = Math.ceil(totalText.length / 4);

      return {
        totalTokens: estimatedTokens,
        cachedContentTokenCount: 0,
      };
    },

    async embedContent(
      _request: EmbedContentParameters,
    ): Promise<EmbedContentResponse> {
      // OpenRouter doesn't support embeddings for Gemini models
      throw new Error(
        'Embeddings are not supported through OpenRouter for Gemini models',
      );
    },
  };

  return openRouterContentGenerator;
}

function normalizeContents(contents: ContentUnion | ContentUnion[]): Content[] {
  if (typeof contents === 'string') {
    return [{ role: 'user', parts: [{ text: contents }] }];
  }

  if (Array.isArray(contents)) {
    return contents.map((content) => {
      if (typeof content === 'string') {
        return { role: 'user', parts: [{ text: content }] };
      }
      // Check if it's a PartUnion[] (old format)
      if (Array.isArray(content)) {
        // Convert Part[] to Content
        const parts: Part[] = content.map((part) => {
          if (typeof part === 'string') {
            return { text: part };
          }
          return part;
        });
        return { role: 'user', parts };
      }
      return content as Content;
    });
  }

  return [contents as Content];
}

function extractSystemInstruction(
  request: GenerateContentParameters,
): string | undefined {
  const instruction = request.config?.systemInstruction;
  if (!instruction) return undefined;

  if (typeof instruction === 'string') {
    return instruction;
  }

  if ('parts' in instruction && instruction.parts) {
    return instruction.parts
      .map((part: Part) => ('text' in part && part.text ? part.text : ''))
      .join('\n');
  }

  return undefined;
}

function convertToOpenAIFormat(
  request: GenerateContentParameters,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const contents = normalizeContents(request.contents);

  return contents
    .map((content: Content) => {
      const role =
        content.role === 'model' ? 'assistant' : (content.role as string);
      const parts = content.parts || [];

      // Handle single text part
      if (parts.length === 1 && parts[0] && 'text' in parts[0]) {
        return {
          role: role as 'user' | 'assistant',
          content: parts[0].text || '',
        };
      }

      // Handle function calls
      const functionCalls = parts.filter(
        (part: Part) => part && 'functionCall' in part,
      );

      if (functionCalls.length > 0 && role === 'assistant') {
        const toolCalls = functionCalls
          .map((part: Part, index: number) => {
            const functionCall = part.functionCall;
            if (!functionCall) return null;

            return {
              id: functionCall.id || `call_${index}`,
              type: 'function' as const,
              function: {
                name: functionCall.name || '',
                arguments: JSON.stringify(functionCall.args || {}),
              },
            };
          })
          .filter(Boolean);

        return {
          role: 'assistant' as const,
          content: null,
          tool_calls: toolCalls as OpenAI.Chat.ChatCompletionMessageToolCall[],
        };
      }

      // Handle function responses
      const functionResponses = parts.filter(
        (part: Part) => part && 'functionResponse' in part,
      );

      if (functionResponses.length > 0 && role === 'function') {
        return functionResponses.map((part: Part, index: number) => ({
          role: 'tool' as const,
          tool_call_id: part.functionResponse?.name || `call_${index}`,
          content: JSON.stringify(part.functionResponse?.response || {}),
        }));
      }

      // Handle text parts
      const textParts = parts.filter((part: Part) => part && 'text' in part);
      const text = textParts
        .map((part: Part) => ('text' in part ? part.text || '' : ''))
        .join('\n');

      return {
        role: (role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: text,
      };
    })
    .flat();
}

import type { ToolListUnion, Tool as GenaiTool } from '@google/genai';

function convertTools(
  tools?: ToolListUnion,
): OpenAI.Chat.ChatCompletionTool[] | undefined {
  if (!tools) return undefined;
  
  // Normalize tools to array
  const toolsArray = Array.isArray(tools) ? tools : [tools];
  if (toolsArray.length === 0) return undefined;
  
  // Get the first tool (usually only one tool object with function declarations)
  const firstTool = toolsArray[0];
  if (!firstTool || typeof firstTool === 'string') return undefined;
  
  const functionDeclarations = (firstTool as GenaiTool).functionDeclarations;
  if (!functionDeclarations) return undefined;

  return functionDeclarations.map((func) => ({
    type: 'function' as const,
    function: {
      name: func.name || '',
      description: func.description,
      parameters: (func.parameters || {}) as Record<string, unknown>,
    },
  }));
}

function convertToGeminiResponse(
  completion: OpenAI.Chat.ChatCompletion,
): GenerateContentResponse {
  const choice = completion.choices[0];
  const message = choice.message;

  const parts: Part[] = [];

  if (message.content) {
    parts.push({ text: message.content });
  }

  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      if (toolCall.function) {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments),
          },
        });
      }
    }
  }

  const candidates: Candidate[] = [
    {
      content: {
        role: 'model',
        parts,
      },
      finishReason: mapFinishReason(choice.finish_reason),
      avgLogprobs: 0,
    },
  ];

  const promptFeedback = new GenerateContentResponsePromptFeedback();
  promptFeedback.blockReason = BlockedReason.BLOCKED_REASON_UNSPECIFIED;
  promptFeedback.safetyRatings = [];

  const usage = completion.usage as OpenRouterUsage | undefined;

  const usageMetadata = new GenerateContentResponseUsageMetadata();
  usageMetadata.promptTokenCount = usage?.prompt_tokens || 0;
  usageMetadata.candidatesTokenCount = usage?.completion_tokens || 0;
  usageMetadata.totalTokenCount = usage?.total_tokens || 0;
  usageMetadata.cachedContentTokenCount = 0;

  const response = new GenerateContentResponse();
  response.candidates = candidates;
  response.promptFeedback = promptFeedback;
  response.usageMetadata = usageMetadata;

  return response;
}

function convertChunkToGeminiResponse(
  chunk: OpenAI.Chat.ChatCompletionChunk,
): GenerateContentResponse {
  const choice = chunk.choices?.[0];
  const delta = choice?.delta;

  const parts: Part[] = [];

  if (delta?.content) {
    parts.push({ text: delta.content });
  }

  if (delta?.tool_calls) {
    for (const toolCall of delta.tool_calls) {
      if (toolCall.function) {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: toolCall.function.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {},
          },
        });
      }
    }
  }

  const candidates: Candidate[] =
    parts.length > 0
      ? [
          {
            content: {
              role: 'model',
              parts,
            },
            finishReason: choice?.finish_reason
              ? mapFinishReason(choice.finish_reason)
              : FinishReason.STOP,
            avgLogprobs: 0,
          },
        ]
      : [];

  const response = new GenerateContentResponse();
  response.candidates = candidates;

  const promptFeedback = new GenerateContentResponsePromptFeedback();
  promptFeedback.blockReason = BlockedReason.BLOCKED_REASON_UNSPECIFIED;
  promptFeedback.safetyRatings = [];
  response.promptFeedback = promptFeedback;

  const usage = chunk.usage as OpenRouterUsage | undefined;
  if (usage) {
    const usageMetadata = new GenerateContentResponseUsageMetadata();
    usageMetadata.promptTokenCount = usage.prompt_tokens || 0;
    usageMetadata.candidatesTokenCount = usage.completion_tokens || 0;
    usageMetadata.totalTokenCount = usage.total_tokens || 0;
    usageMetadata.cachedContentTokenCount = 0;
    response.usageMetadata = usageMetadata;
  }

  return response;
}

function mapFinishReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case 'stop':
      return FinishReason.STOP;
    case 'length':
      return FinishReason.MAX_TOKENS;
    case 'tool_calls':
    case 'function_call':
      return FinishReason.STOP;
    case 'content_filter':
      return FinishReason.SAFETY;
    default:
      return FinishReason.OTHER;
  }
}

function convertError(error: unknown): Error {
  if (error instanceof OpenAI.APIError) {
    const message = `OpenRouter API Error: ${error.status} - ${error.message}`;
    const newError = new Error(message);
    (newError as Error & { status?: number }).status = error.status;
    return newError;
  }
  return error instanceof Error ? error : new Error(String(error));
}
