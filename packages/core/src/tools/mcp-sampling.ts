/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
  Part,
} from '@google/genai';
import { FinishReason } from '@google/genai';
import type {
  CreateMessageRequest,
  CreateMessageResult,
  SamplingMessage,
} from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '../config/config.js';

type StopReason = NonNullable<CreateMessageResult['stopReason']>;

type SamplingContentBlock = SamplingMessage['content'] extends infer C
  ? C extends readonly unknown[]
    ? C[number]
    : C
  : never;

/**
 * Handles an MCP `sampling/createMessage` request: converts the MCP request to
 * a Gemini `generateContent` call and converts the response back to an MCP
 * result.
 *
 * This function is the pure core of MCP sampling support. It does not handle
 * user consent, capability advertisement, or transport wiring — callers are
 * expected to register it as a request handler on an MCP client and to gate
 * invocation with whatever approval policy is appropriate.
 *
 * Only `text` and `image` content blocks are supported in v1. `audio`,
 * `tool_use`, and `tool_result` are rejected.
 */
export async function handleSamplingRequest(
  request: CreateMessageRequest,
  config: Config,
  abortSignal: AbortSignal,
): Promise<CreateMessageResult> {
  const params = request.params;
  const contents: Content[] = params.messages.map(toGeminiContent);

  const generationConfig: GenerateContentConfig = { abortSignal };
  if (params.systemPrompt !== undefined) {
    generationConfig.systemInstruction = params.systemPrompt;
  }
  if (params.maxTokens !== undefined) {
    generationConfig.maxOutputTokens = params.maxTokens;
  }
  if (params.temperature !== undefined) {
    generationConfig.temperature = params.temperature;
  }
  if (params.stopSequences !== undefined) {
    generationConfig.stopSequences = params.stopSequences;
  }

  const model = config.getModel();
  const generator = config.getContentGenerator();
  const response = await generator.generateContent(
    { model, contents, config: generationConfig },
    `mcp-sampling-${randomUUID()}`,
  );

  return toMcpResult(response, model);
}

function toGeminiContent(message: SamplingMessage): Content {
  const blocks: readonly SamplingContentBlock[] = Array.isArray(message.content)
    ? message.content
    : [message.content];
  const parts: Part[] = blocks.map(toGeminiPart);
  return {
    role: message.role === 'assistant' ? 'model' : 'user',
    parts,
  };
}

function toGeminiPart(block: SamplingContentBlock): Part {
  switch (block.type) {
    case 'text':
      return { text: block.text };
    case 'image':
      return {
        inlineData: { mimeType: block.mimeType, data: block.data },
      };
    case 'audio':
      throw new Error(
        'MCP sampling: audio content is not supported in this version.',
      );
    default:
      throw new Error(
        `MCP sampling: unsupported content type "${(block as { type: string }).type}".`,
      );
  }
}

function toMcpResult(
  response: GenerateContentResponse,
  model: string,
): CreateMessageResult {
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text)
    .filter((t): t is string => typeof t === 'string')
    .join('');
  if (!text) {
    throw new Error('MCP sampling: model returned no text content.');
  }
  return {
    role: 'assistant',
    content: { type: 'text', text },
    model,
    stopReason: mapFinishReason(candidate?.finishReason),
  };
}

function mapFinishReason(reason: FinishReason | undefined): StopReason {
  if (reason === FinishReason.MAX_TOKENS) {
    return 'maxTokens';
  }
  return 'endTurn';
}
