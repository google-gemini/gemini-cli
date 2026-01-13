/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  Part,
  GenerateContentParameters,
  GenerateContentResponse,
  Tool,
  FinishReason,
} from '@google/genai';
import type {
  OpenAIChatMessage,
  OpenAIChatCompletionRequest,
  OpenAIChatCompletionResponse,
  OpenAIChatCompletionChunk,
  OpenAITool,
  OpenAIToolCall,
  OpenAIFinishReason,
} from './types.js';
import { Provider } from '../types.js';

// ============ REQUEST TRANSLATION (Gemini -> OpenAI) ============

/**
 * Translate Gemini GenerateContentParameters to OpenAI chat completion request.
 */
export function translateRequestToOpenAI(
  req: GenerateContentParameters,
  provider: Provider,
): OpenAIChatCompletionRequest {
  const contents = req.contents as Content[];
  const messages = translateContentsToMessages(contents);
  // Cast tools to Tool[] - we only support basic function declarations
  const tools = translateToolsToOpenAI(req.config?.tools as Tool[] | undefined);

  const openAIRequest: OpenAIChatCompletionRequest = {
    model: req.model,
    messages,
    stream: true,
  };

  if (tools && tools.length > 0) {
    openAIRequest.tools = tools;
    openAIRequest.tool_choice = 'auto';
  }

  // Translate generation config
  if (req.config?.temperature !== undefined) {
    openAIRequest.temperature = req.config.temperature;
  }
  if (req.config?.maxOutputTokens !== undefined) {
    openAIRequest.max_tokens = req.config.maxOutputTokens;
  }
  if (req.config?.topP !== undefined) {
    openAIRequest.top_p = req.config.topP;
  }

  // Provider-specific thinking mode
  const thinkingEnabled = req.config?.thinkingConfig?.includeThoughts;
  if (thinkingEnabled) {
    if (provider === Provider.GLM) {
      openAIRequest.extra_body = { enable_thinking: true };
    }
    // DeepSeek: thinking is enabled by default for deepseek-reasoner model
  }

  // System instruction as first system message
  if (req.config?.systemInstruction) {
    const sysContent = extractTextFromContent(req.config.systemInstruction);
    if (sysContent) {
      messages.unshift({ role: 'system', content: sysContent });
    }
  }

  return openAIRequest;
}

/**
 * Translate Gemini Content array to OpenAI messages.
 */
function translateContentsToMessages(contents: Content[]): OpenAIChatMessage[] {
  const messages: OpenAIChatMessage[] = [];

  for (const content of contents) {
    const role =
      content.role === 'model'
        ? 'assistant'
        : (content.role as 'user' | 'assistant');

    if (!content.parts || content.parts.length === 0) {
      continue;
    }

    // Check for function responses (tool results)
    const functionResponses = content.parts.filter((p) => p.functionResponse);
    if (functionResponses.length > 0) {
      for (const part of functionResponses) {
        messages.push({
          role: 'tool',
          content: JSON.stringify(part.functionResponse?.response ?? {}),
          tool_call_id: part.functionResponse?.name ?? 'unknown',
        });
      }
      continue;
    }

    // Check for function calls
    const functionCalls = content.parts.filter((p) => p.functionCall);
    if (functionCalls.length > 0) {
      const toolCalls: OpenAIToolCall[] = functionCalls.map((part, idx) => ({
        id: part.functionCall?.name ?? `call_${idx}`,
        type: 'function' as const,
        function: {
          name: part.functionCall?.name ?? '',
          arguments: JSON.stringify(part.functionCall?.args ?? {}),
        },
      }));

      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: toolCalls,
      });
      continue;
    }

    // Regular text content (excluding thoughts)
    const textParts = content.parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join('');

    if (textParts) {
      messages.push({ role, content: textParts });
    }
  }

  return messages;
}

/**
 * Translate Gemini tools to OpenAI format.
 */
function translateToolsToOpenAI(tools?: Tool[]): OpenAITool[] | undefined {
  if (!tools) return undefined;

  const openAITools: OpenAITool[] = [];
  for (const tool of tools) {
    if (tool.functionDeclarations) {
      for (const func of tool.functionDeclarations) {
        openAITools.push({
          type: 'function',
          function: {
            name: func.name ?? '',
            description: func.description,
            parameters: func.parameters as Record<string, unknown>,
          },
        });
      }
    }
  }
  return openAITools.length > 0 ? openAITools : undefined;
}

/**
 * Extract text content from a Content-like object.
 */
function extractTextFromContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && content !== null) {
    const c = content as { parts?: Array<{ text?: string }> };
    if (c.parts) {
      return c.parts.map((p) => p.text ?? '').join('');
    }
  }
  return null;
}

// ============ RESPONSE TRANSLATION (OpenAI -> Gemini) ============

/**
 * Translate OpenAI chat completion response to Gemini format.
 */
export function translateResponseToGemini(
  openAIResponse: OpenAIChatCompletionResponse,
): GenerateContentResponse {
  const choice = openAIResponse.choices[0];
  if (!choice) {
    return {
      candidates: [],
      responseId: openAIResponse.id,
    } as unknown as GenerateContentResponse;
  }

  const parts: Part[] = [];

  // Handle reasoning content (thinking tokens)
  if (choice.message.reasoning_content) {
    parts.push({
      text: choice.message.reasoning_content,
      thought: true,
    } as Part);
  }

  // Handle regular content
  if (choice.message.content) {
    parts.push({ text: choice.message.content });
  }

  // Handle tool calls
  if (choice.message.tool_calls) {
    for (const toolCall of choice.message.tool_calls) {
      let args: Record<string, unknown> = {};
      if (toolCall.function.arguments) {
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }
      }
      parts.push({
        functionCall: {
          name: toolCall.function.name,
          args,
        },
      });
    }
  }

  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts,
        },
        finishReason: translateFinishReason(choice.finish_reason),
      },
    ],
    usageMetadata: openAIResponse.usage
      ? {
          promptTokenCount: openAIResponse.usage.prompt_tokens,
          candidatesTokenCount: openAIResponse.usage.completion_tokens,
          totalTokenCount: openAIResponse.usage.total_tokens,
        }
      : undefined,
    responseId: openAIResponse.id,
  } as GenerateContentResponse;
}

/**
 * Translate OpenAI streaming chunk to Gemini format.
 */
export function translateStreamChunkToGemini(
  chunk: OpenAIChatCompletionChunk,
): GenerateContentResponse {
  const choice = chunk.choices[0];
  if (!choice) {
    return {
      candidates: [],
      responseId: chunk.id,
    } as unknown as GenerateContentResponse;
  }

  const parts: Part[] = [];

  // Handle reasoning content delta
  if (choice.delta.reasoning_content) {
    parts.push({
      text: choice.delta.reasoning_content,
      thought: true,
    } as Part);
  }

  // Handle content delta
  if (choice.delta.content) {
    parts.push({ text: choice.delta.content });
  }

  // Tool call deltas are accumulated separately (in streamAccumulator)
  // We don't emit partial tool calls as the Gemini format expects complete calls

  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts: parts.length > 0 ? parts : undefined,
        },
        finishReason: translateFinishReason(choice.finish_reason),
      },
    ],
    usageMetadata: chunk.usage
      ? {
          promptTokenCount: chunk.usage.prompt_tokens,
          candidatesTokenCount: chunk.usage.completion_tokens,
          totalTokenCount: chunk.usage.total_tokens,
        }
      : undefined,
    responseId: chunk.id,
  } as GenerateContentResponse;
}

/**
 * Translate OpenAI finish reason to Gemini FinishReason.
 */
function translateFinishReason(
  reason: OpenAIFinishReason | null,
): FinishReason | undefined {
  if (!reason) return undefined;

  switch (reason) {
    case 'stop':
      return 'STOP' as FinishReason;
    case 'tool_calls':
      return 'STOP' as FinishReason; // With functionCall parts
    case 'length':
      return 'MAX_TOKENS' as FinishReason;
    case 'content_filter':
      return 'SAFETY' as FinishReason;
    default:
      return 'OTHER' as FinishReason;
  }
}

/**
 * Create a Gemini response from accumulated tool calls (emitted at end of stream).
 */
export function createToolCallResponse(
  toolCalls: OpenAIToolCall[],
  responseId: string,
): GenerateContentResponse {
  const parts: Part[] = toolCalls.map((tc) => {
    let args: Record<string, unknown> = {};
    if (tc.function.arguments) {
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }
    }
    return {
      functionCall: {
        name: tc.function.name,
        args,
      },
    };
  });

  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts,
        },
        finishReason: 'STOP' as FinishReason,
      },
    ],
    responseId,
  } as GenerateContentResponse;
}
